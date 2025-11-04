# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Firebase Cloud Functions webhook that processes Mercado Pago payment events and sends real-time notifications to a Telegram bot. Used for restaurant payment notifications to a tablet.

## Architecture

```
Mercado Pago (payment event)
  → Firebase Cloud Function (mpWebhook)
  → Telegram Bot API
  → Tablet notification
```

## Project Structure

```
functions/
  ├── index.js          # Main webhook handler (mpWebhook function)
  ├── package.json      # Node.js dependencies
  └── .env.local        # Local environment variables (not committed)
firebase.json           # Firebase configuration
.firebaserc             # Firebase project aliases
```

## Key Commands

### Firebase Setup & Deployment
```bash
# Login to Firebase
firebase login

# Select/create project
firebase use <project-id>

# Initialize functions (if not done)
firebase init functions
# Select: JavaScript, No ESLint, Yes to npm install

# Deploy functions
firebase deploy --only functions

# View logs
firebase functions:log

# Get function configuration
firebase functions:config:get
```

### Environment Variables

**Production (Firebase):**
```bash
firebase functions:config:set \
  telegram.bot_token="<TOKEN>" \
  telegram.chat_id="<CHAT_ID>"
```

**Local Development:**
Create `functions/.env.local`:
```
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_CHAT_ID=<chat_id>
```

## Firebase Function Details

**Function name:** `mpWebhook`
**Region:** `us-central1`
**Trigger:** HTTPS POST request
**URL format:** `https://us-central1-{PROJECT_ID}.cloudfunctions.net/mpWebhook`

### Webhook Payload (Mercado Pago)

Expected event:
```json
{
  "action": "payment.updated",
  "data": {
    "id": 12345678,
    "status": "approved",
    "transaction_amount": 150.50,
    "payer": {
      "email": "cliente@example.com"
    }
  }
}
```

Only processes `payment.updated` events with `status: "approved"`.

### Code Architecture

The function in `functions/index.js`:
1. Sets CORS headers (allows all origins)
2. Validates HTTP method (POST only)
3. Parses Mercado Pago webhook payload
4. Filters for approved payments
5. Formats Telegram message with payment details
6. Sends to Telegram Bot API using `fetch()`
7. Returns success/error response

**Key variables from env:**
- `process.env.TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
- `process.env.TELEGRAM_CHAT_ID` - Target chat/group ID

## Testing

### Importante sobre webhooks de prueba
Los webhooks de **prueba** de Mercado Pago envían IDs ficticios que NO existen en la API. Por ejemplo:
- Test webhook: `{ "data": { "id": "123456" } }`
- Al consultar `/v1/payments/123456` → **404 Not Found**

Esto es **normal y esperado**. El webhook funciona correctamente, solo necesitas un pago real para probarlo.

### Opción 1: Crear pago de prueba real
Usa las credenciales de prueba y crea un pago usando:
- [Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing)
- [Checkout API](https://www.mercadopago.com.ar/developers/es/docs/checkout-api/landing)

El pago generará un webhook con un ID real que sí existe en la API.

### Opción 2: Webhook test manual (solo estructura)
```bash
curl -X POST \
  https://us-central1-{PROJECT_ID}.cloudfunctions.net/mpWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment",
    "data": {
      "id": "PAYMENT_ID_REAL"
    }
  }'
```
**Nota**: Reemplaza `PAYMENT_ID_REAL` con un ID de pago existente.

### Desde Mercado Pago Dashboard:
1. Dashboard → Webhooks → "Enviar evento de prueba"
2. Esto enviará un ID ficticio → error 404 esperado
3. Para prueba real: crear pago de prueba primero

## External Setup Requirements

### Telegram Bot Setup
1. Create bot via @BotFather in Telegram (`/newbot`)
2. Get `TELEGRAM_BOT_TOKEN` from BotFather
3. Add bot to target group/chat
4. Send message, then get `TELEGRAM_CHAT_ID` from:
   ```
   https://api.telegram.org/bot{TOKEN}/getUpdates
   ```
   Look for `"chat":{"id": NUMBER}`

### Mercado Pago Webhook Configuration
1. Dashboard → Configuración → Integraciones → Webhooks
2. Add Firebase function URL
3. Subscribe to `payment.updated` events

## Security Considerations

- Cloud Functions has HTTP fetch permissions by default (no additional Firebase permissions needed)
- Consider adding Mercado Pago signature validation (`x-signature` header with HMAC SHA-256)
- Consider rate limiting to prevent spam
- Never commit `.env.local` or credentials to git

## Common Issues

- **404 on function URL**: Wait 1-2 minutes after deploy, verify URL is exact
- **Telegram "Unauthorized"**: Token invalid/expired, recreate bot
- **No messages received**: Verify bot is in the chat, check CHAT_ID includes `-` prefix if negative
- **"firebase-functions not found"**: Run `cd functions && npm install firebase-functions`

## Dependencies

**Runtime:** Node.js 18+
**Key packages:** `firebase-functions` (included in Firebase Functions environment)
**External APIs:** Telegram Bot API, Mercado Pago Webhooks

## Cost

- Firebase Cloud Functions: Free tier (2M invocations/month)
- Telegram Bot API: Free
- Mercado Pago Webhooks: Included
