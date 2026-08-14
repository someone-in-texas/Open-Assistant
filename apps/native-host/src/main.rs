mod codex;
mod openai;
mod protocol;

use keyring::Entry;
use protocol::{MAX_MESSAGE_BYTES, Provider, Request, response};
use reqwest::Client;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::sync::mpsc::{Receiver, Sender};
use tokio::sync::mpsc as tokio_mpsc;
use tokio::task::JoinHandle;
use uuid::Uuid;
use zeroize::Zeroize;

const KEYCHAIN_SERVICE: &str = "org.mozilla.open-assistant";
const KEYCHAIN_USER: &str = "openai-api-key";
const MAX_ACTIVE_REQUESTS: usize = 4;

fn keychain() -> Result<Entry, keyring::Error> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)
}

fn read_message() -> io::Result<Option<Vec<u8>>> {
    let mut length = [0_u8; 4];
    match io::stdin().read_exact(&mut length) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(error),
    }
    let size = u32::from_le_bytes(length) as usize;
    if size == 0 || size > MAX_MESSAGE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "native message size rejected",
        ));
    }
    let mut body = vec![0_u8; size];
    io::stdin().read_exact(&mut body)?;
    Ok(Some(body))
}

fn write_message(value: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(value).map_err(io::Error::other)?;
    if body.len() > MAX_MESSAGE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "native response size rejected",
        ));
    }
    let length = u32::try_from(body.len()).map_err(io::Error::other)?;
    io::stdout().write_all(&length.to_le_bytes())?;
    io::stdout().write_all(&body)?;
    io::stdout().flush()
}

fn spawn_reader(output: tokio_mpsc::UnboundedSender<Result<Request, ()>>) {
    std::thread::spawn(move || {
        loop {
            match read_message() {
                Ok(Some(mut bytes)) => {
                    let request = serde_json::from_slice::<Request>(&bytes).map_err(|_| ());
                    bytes.zeroize();
                    if output.send(request).is_err() {
                        break;
                    }
                }
                Ok(None) => break,
                Err(_) => {
                    let _ = output.send(Err(()));
                    break;
                }
            }
        }
    });
}

fn spawn_writer(input: Receiver<Value>) {
    std::thread::spawn(move || {
        while let Ok(value) = input.recv() {
            if write_message(&value).is_err() {
                break;
            }
        }
    });
}

#[tokio::main]
async fn main() -> io::Result<()> {
    let client = Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(75))
        .build()
        .map_err(io::Error::other)?;
    let (request_tx, mut request_rx) = tokio_mpsc::unbounded_channel();
    let (output_tx, output_rx) = std::sync::mpsc::channel();
    spawn_reader(request_tx);
    spawn_writer(output_rx);
    let mut active = HashMap::<Uuid, JoinHandle<()>>::new();
    while let Some(request) = request_rx.recv().await {
        active.retain(|_, handle| !handle.is_finished());
        let request = match request {
            Ok(request) => request,
            Err(()) => {
                let _ = output_tx.send(response(None, false, None, Some("invalid_message")));
                continue;
            }
        };
        if let Request::Cancel {
            request_id,
            target_request_id,
        } = request
        {
            if let Some(handle) = active.remove(&target_request_id) {
                handle.abort();
            }
            let _ = output_tx.send(response(Some(request_id), true, None, None));
            continue;
        }
        let request_id = request.request_id();
        if active.contains_key(&request_id) {
            let _ = output_tx.send(response(Some(request_id), false, None, Some("validation")));
            continue;
        }
        if active.len() >= MAX_ACTIVE_REQUESTS {
            let _ = output_tx.send(response(Some(request_id), false, None, Some("busy")));
            continue;
        }
        let task = tokio::spawn(handle_request(request, client.clone(), output_tx.clone()));
        active.insert(request_id, task);
    }
    for (_, handle) in active {
        handle.abort();
    }
    Ok(())
}

async fn handle_request(request: Request, client: Client, output: Sender<Value>) {
    match request {
        Request::Status { request_id } => {
            let key_stored = match keychain().and_then(|entry| entry.get_password()) {
                Ok(mut password) => {
                    password.zeroize();
                    true
                }
                Err(_) => false,
            };
            let codex = codex::status().await;
            let _ = output.send(response(
                Some(request_id),
                true,
                Some(json!({
                    "version": env!("CARGO_PKG_VERSION"),
                    "byok": { "keyStored": key_stored },
                    "codex": codex,
                })),
                None,
            ));
        }
        Request::StoreKey {
            request_id,
            mut api_key,
        } => {
            let valid = api_key.starts_with("sk-") && (20..=512).contains(&api_key.len());
            let stored = valid
                && keychain()
                    .and_then(|entry| entry.set_password(&api_key))
                    .is_ok();
            api_key.zeroize();
            let _ = output.send(response(
                Some(request_id),
                stored,
                None,
                (!stored).then_some("key_storage_failed"),
            ));
        }
        Request::DeleteKey { request_id } => {
            let removed = match keychain() {
                Ok(entry) => match entry.delete_credential() {
                    Ok(()) | Err(keyring::Error::NoEntry) => true,
                    Err(_) => false,
                },
                Err(_) => false,
            };
            let _ = output.send(response(
                Some(request_id),
                removed,
                None,
                (!removed).then_some("key_deletion_failed"),
            ));
        }
        Request::CodexLogin { request_id } => {
            if let Err(error) = codex::login(request_id, output.clone()).await {
                let _ = output.send(response(Some(request_id), false, None, Some(error)));
            }
        }
        Request::CodexLogout { request_id } => {
            let result = codex::logout().await;
            let _ = output.send(response(
                Some(request_id),
                result.is_ok(),
                None,
                result.err(),
            ));
        }
        Request::Model {
            request_id,
            provider,
            model,
            payload,
        } => match provider {
            Provider::Byok => {
                let api_key = match keychain().and_then(|entry| entry.get_password()) {
                    Ok(api_key) => api_key,
                    Err(_) => {
                        let _ = output.send(response(
                            Some(request_id),
                            false,
                            None,
                            Some("key_missing"),
                        ));
                        return;
                    }
                };
                openai::run(client, request_id, model, payload, api_key, output).await;
            }
            Provider::Codex => codex::run(request_id, model, payload, output).await,
        },
        Request::Cancel { .. } => {}
    }
}
