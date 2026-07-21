# Editor adapters

Supported: textarea; text/search inputs; email inputs subject to risk review; and basic, uniquely anchored `contenteditable=true`. Text controls use saved offsets, surrounding hash, `setRangeText`, focus/scroll preservation, and input events. Contenteditable resolves one unambiguous text range and inserts a text node—never model HTML.

Unsupported: password/OTP/payment/hidden fields, canvas editors, inaccessible shadow roots, ambiguous/complex collaborative editors, unsupported cross-origin frames, and rich-text HTML insertion. Failure preserves the proposal and offers copy fallback. Undo remains valid only while the same element and exact post-edit content remain.
