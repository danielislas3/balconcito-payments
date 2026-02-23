# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Firebase Cloud Functions que procesa eventos de pago de Mercado Pago y envía notificaciones en tiempo real a un bot de Telegram. Usado para notificaciones de pagos en un restaurante.

## Architecture

```
Mercado Pago (webhook event)
  → mpWebhook (Firebase Cloud Function)
    → SignatureValidator (HMAC SHA-256)
    → WebhookController
    → ProcessPaymentWebhookUseCase
      → MercadoPagoService (fetch payment details)
      → PaymentMessageFormatter
      → TelegramService (send notification)

Cloud Scheduler (every 2 min)
  → checkMovements (Firebase Cloud Function)
    → CheckRecentMovementsUseCase
      → MercadoPagoService (fetch recent payments)
      → Firestore (deduplication via processedPayments collection)
      → TelegramService (send notification)
```

**Two functions:**
- `mpWebhook` — HTTPS POST, triggered by Mercado Pago webhooks
- `checkMovements` — Scheduled every 2 minutes, polls MP API to catch direct transfers that don't trigger webhooks

**Payment filtering:** Only notifies `bank_transfer`, `account_money`, and `ticket` types. Credit/debit card payments are intentionally ignored.

## Project Structure

```
functions/
  ├── index.js                        # DI wiring + Cloud Function exports
  ├── src/
  │   ├── controllers/
  │   │   └── WebhookController.js    # CORS, method validation, routing
  │   ├── use-cases/
  │   │   ├── ProcessPaymentWebhookUseCase.js  # Webhook flow
  │   │   └── CheckRecentMovementsUseCase.js   # Polling flow
  │   ├── services/
  │   │   ├── MercadoPagoService.js   # MP API client (getPaymentDetails, getRecentPayments)
  │   │   └── TelegramService.js      # Telegram Bot API client
  │   ├── validators/
  │   │   └── SignatureValidator.js   # HMAC SHA-256 x-signature validation
  │   └── formatters/
  │       └── PaymentMessageFormatter.js  # Telegram message formatting
  └── package.json                    # Node.js 20, firebase-functions v5
firebase.json                         # Functions + Firestore config (region: nam5)
```

## Key Commands

```bash
# Deploy functions
firebase deploy --only functions

# View logs
firebase functions:log

# Run local emulator
cd functions && npm run serve

# Get/set remote config
firebase functions:config:get
firebase functions:config:set telegram.bot_token="<TOKEN>" telegram.chat_id="<CHAT_ID>"
firebase functions:config:set mercadopago.access_token="<TOKEN>" mercadopago.secret="<SECRET>"
```

## Environment Variables

**Production (Firebase config):**
- `telegram.bot_token` — Bot token from @BotFather
- `telegram.chat_id` — Target chat ID (negative for groups)
- `mercadopago.access_token` — MP API access token
- `mercadopago.secret` — MP webhook secret for signature validation

**Local development** (`functions/.env.local` — not committed):
```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

## Webhook Flow Details

Mercado Pago sends `{ type: "payment", data: { id: "PAYMENT_ID" } }` — the function then fetches full payment details from the MP API. The payload described in previous docs was incorrect; the webhook itself only contains the payment ID.

**Signature validation** (`SignatureValidator.js`): If `mercadopago.secret` is not set, validation is skipped (useful for testing). If `x-signature`/`x-request-id` headers are absent, it also passes (to allow manual testing).

**Deduplication** (`checkMovements`): Uses Firestore collection `processedPayments` with payment ID as document key to avoid duplicate notifications.

## Testing

**Test webhooks from MP Dashboard** send fake IDs that return 404 from the API — this is expected and normal. For real testing, create an actual test payment via Checkout Pro/API.

```bash
# Manual webhook test (use a real payment ID)
curl -X POST \
  https://us-central1-balconcito-payments.cloudfunctions.net/mpWebhook \
  -H "Content-Type: application/json" \
  -d '{"type": "payment", "data": {"id": "REAL_PAYMENT_ID"}}'
```

## Common Issues

- **404 on payment ID**: Expected for MP test webhooks with fake IDs
- **Telegram "Unauthorized"**: Token invalid/expired, recreate bot via @BotFather
- **No messages received**: Verify bot is in the chat; `CHAT_ID` requires `-` prefix for groups
- **Duplicate notifications**: Check Firestore `processedPayments` collection
