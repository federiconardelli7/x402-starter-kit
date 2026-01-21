/**
 * Normalizes ECDSA signature v value to legacy format (27/28)
 * 
 * Wallets may produce signatures with different v value formats:
 * - yParity: 0 or 1
 * - Legacy: 27 or 28  
 * - EIP-155: chainId * 2 + 35 + yParity
 * 
 * This function converts all formats to legacy (27/28) for compatibility
 */
export function normalizeSignatureV(signature: string, chainId: number): string {
  // Extract v value from signature (last byte or two)
  const vHex = signature.slice(130);
  const vValue = parseInt(vHex, 16);

  // Debug logging for signature normalization
  console.log('=== Signature Normalization ===');
  console.log('Original v value:', vHex, '=', vValue);

  let normalizedV: number;

  if (vValue === 0 || vValue === 1) {
    // Already in yParity format, convert to legacy
    normalizedV = vValue + 27;
  } else if (vValue === 27 || vValue === 28) {
    // Already in legacy format
    normalizedV = vValue;
  } else if (vValue >= 35) {
    // EIP-155 format: v = chainId * 2 + 35 + yParity
    // Extract yParity: yParity = (v - 35 - chainId * 2) % 2
    const yParity = (vValue - 35 - chainId * 2) % 2;
    normalizedV = yParity + 27;
  } else {
    console.warn('Unexpected v value:', vValue, '- attempting fallback');
    normalizedV = vValue;
  }

  console.log('Normalized v:', normalizedV);
  console.log('===============================');

  // Reconstruct signature with normalized v
  const normalizedSignature = signature.slice(0, 130) + normalizedV.toString(16).padStart(2, '0');
  
  return normalizedSignature;
}

/**
 * Creates a fetch wrapper that normalizes payment signatures
 */
export function createNormalizedFetch(chainId: number): typeof fetch {
  return async (input, init) => {
    console.log('=== Normalized Fetch Called ===');
    console.log('URL:', input);
    console.log('Init:', JSON.stringify(init, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    , 2));

    // Extract payment header - check all possible header names (v1 and v2)
    let paymentHeader: string | null = null;

    if (init?.headers instanceof Headers) {
      paymentHeader = init.headers.get('x-payment') || init.headers.get('X-PAYMENT') ||
                      init.headers.get('payment-signature') || init.headers.get('PAYMENT-SIGNATURE');
      console.log('Headers (Headers object):', [...init.headers.entries()]);
    } else if (typeof init?.headers === 'object' && init.headers !== null) {
      const headers = init.headers as Record<string, string>;
      console.log('Headers (plain object):', headers);
      paymentHeader = headers['x-payment'] || headers['X-PAYMENT'] ||
                      headers['payment-signature'] || headers['PAYMENT-SIGNATURE'];
    }

    console.log('Payment header present:', paymentHeader ? 'yes' : 'no');

    if (paymentHeader) {
      try {
        // Decode base64 payment
        const decoded = JSON.parse(atob(paymentHeader));

        if (decoded.payload?.signature) {
          // Normalize the signature
          const originalSig = decoded.payload.signature;
          const normalizedSig = normalizeSignatureV(originalSig, chainId);

          // Update the signature in the payload
          decoded.payload.signature = normalizedSig;

          // Re-encode to base64
          const normalizedPaymentHeader = btoa(JSON.stringify(decoded));

          // Update headers with normalized payment - use uppercase to match Thirdweb SDK
          if (init?.headers instanceof Headers) {
            init.headers.set('X-PAYMENT', normalizedPaymentHeader);
          } else if (typeof init?.headers === 'object' && init.headers !== null) {
            const headers = init.headers as Record<string, string>;
            // Remove old header (either case) and add uppercase version
            delete headers['x-payment'];
            delete headers['X-PAYMENT'];
            headers['X-PAYMENT'] = normalizedPaymentHeader;
          }
        }
      } catch (e) {
        console.error('Failed to normalize payment:', e);
      }
    }

    console.log('=== Making fetch request ===');
    const result = await fetch(input, init);
    console.log('Fetch result status:', result.status);
    return result;
  };
}
