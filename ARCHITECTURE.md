# Arquitectura del Proyecto - Balconcito Card Payments

## 📋 Descripción General

Sistema de notificaciones de pagos que integra Mercado Pago con Telegram mediante Firebase Cloud Functions. Cuando se recibe un pago en Mercado Pago, automáticamente se envía una notificación a un grupo de Telegram con los detalles del pago.

## 🏗️ Arquitectura de Alto Nivel

```
┌──────────────────────────────────────────────────────────────┐
│                    DUAL NOTIFICATION SYSTEM                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Path 1: Webhook (Comercial operations - Instant)          │
│  ┌─────────────────┐                                        │
│  │  Mercado Pago   │ Pago aprobado (QR/Link/Checkout)      │
│  │   (Webhook)     │                                        │
│  └────────┬────────┘                                        │
│           │ POST /mpWebhook                                 │
│           ▼                                                 │
│  ┌─────────────────────────────────┐                       │
│  │   Firebase Cloud Function       │                       │
│  │      (mpWebhook)                │                       │
│  │  ┌────────────────────────────┐ │                       │
│  │  │  1. Validar firma HMAC     │ │                       │
│  │  │  2. Consultar API de MP    │ │                       │
│  │  │  3. Verificar status       │ │                       │
│  │  │  4. Formatear mensaje      │ │                       │
│  │  │  5. Enviar a Telegram      │ │                       │
│  │  └────────────────────────────┘ │                       │
│  └────────┬────────────────────────┘                       │
│           │                                                 │
│           └────────────────┐                                │
│                            │                                │
│  Path 2: Polling (Direct transfers - Every 2 min)         │
│  ┌─────────────────────────────────┐                       │
│  │   Cloud Scheduler (every 2 min) │                       │
│  └────────┬────────────────────────┘                       │
│           ▼                                                 │
│  ┌─────────────────────────────────┐                       │
│  │   checkMovements Function       │                       │
│  │  ┌────────────────────────────┐ │                       │
│  │  │  1. Query recent payments  │ │                       │
│  │  │  2. Filter approved        │ │                       │
│  │  │  3. Check Firestore (dup?) │ │                       │
│  │  │  4. Formatear mensaje      │ │                       │
│  │  │  5. Enviar a Telegram      │ │                       │
│  │  │  6. Mark as processed      │ │                       │
│  │  └────────────────────────────┘ │                       │
│  └────────┬────────────────────────┘                       │
│           │                                                 │
│           └────────────────┐                                │
│                            │                                │
│                            ▼                                │
│                   ┌─────────────────┐                       │
│                   │  Telegram API   │                       │
│                   │   (Bot)         │                       │
│                   └────────┬────────┘                       │
│                            │                                │
│                            ▼                                │
│                   ┌─────────────────┐                       │
│                   │  Grupo/Chat     │                       │
│                   │  de Telegram    │                       │
│                   └─────────────────┘                       │
└──────────────────────────────────────────────────────────────┘

**¿Por qué dual system?**
- Webhooks: Solo funcionan para operaciones comerciales (checkout, QR, links)
- Polling: Necesario para detectar transferencias directas/SPEI que NO disparan webhooks
```

## 🎯 Patrones de Diseño Implementados

### 1. **Clean Architecture / Layered Architecture**

El código está organizado en capas con responsabilidades bien definidas:

```
┌─────────────────────────────────────┐
│     HTTP Layer (Controller)        │
│     - WebhookController            │
│     Responsabilidad: Manejar HTTP  │
├─────────────────────────────────────┤
│     Business Logic (Use Cases)     │
│     - ProcessPaymentWebhookUseCase │
│     Responsabilidad: Lógica negocio│
├─────────────────────────────────────┤
│     Services (External APIs)       │
│     - TelegramService              │
│     - MercadoPagoService           │
│     Responsabilidad: APIs externas │
├─────────────────────────────────────┤
│     Validators & Formatters        │
│     - MercadoPagoSignatureValidator│
│     - PaymentMessageFormatter      │
│     Responsabilidad: Validación    │
└─────────────────────────────────────┘
```

### 2. **Service Layer Pattern**

**Objetivo**: Encapsular la comunicación con APIs externas en servicios reutilizables.

#### `TelegramService`
```javascript
class TelegramService {
  constructor(botToken, chatId) { }
  async sendMessage(text) { }
}
```
- **Responsabilidad**: Comunicación exclusiva con Telegram API
- **Beneficios**:
  - Fácil de testear con mocks
  - Reutilizable en otras functions
  - Cambios en Telegram API aislados

#### `MercadoPagoService`
```javascript
class MercadoPagoService {
  constructor(accessToken) { }
  async getPaymentDetails(paymentId) { }
  async getRecentPayments(limit) { }
}
```
- **Responsabilidad**: Comunicación exclusiva con Mercado Pago API
- **Endpoints**:
  - `GET /v1/payments/{id}` - Detalles de un pago específico
  - `GET /v1/payments/search?sort=date_created&criteria=desc&limit=20` - Pagos recientes
- **Beneficios**:
  - Centraliza lógica de autenticación
  - Manejo de errores específico de MP
  - Fácil cambiar a MCP de Mercado Pago

### 3. **Strategy Pattern**

**Objetivo**: Permitir diferentes estrategias de validación intercambiables.

#### `MercadoPagoSignatureValidator`
```javascript
class MercadoPagoSignatureValidator {
  constructor(secret) { }
  validate(req) { }
  extractSignatureParams(signature) { }
}
```
- **Responsabilidad**: Validar firmas HMAC-SHA256 de Mercado Pago
- **Beneficios**:
  - Puedes intercambiar por otra estrategia (ej: JWT)
  - Aislado del controlador HTTP
  - Fácil de testear unitariamente

### 4. **Use Case Pattern (Clean Architecture)**

**Objetivo**: Encapsular lógica de negocio independiente de frameworks.

#### `ProcessPaymentWebhookUseCase`
```javascript
class ProcessPaymentWebhookUseCase {
  constructor(mercadoPagoService, telegramService) { }
  async execute(paymentId) { }
}
```
- **Responsabilidad**: Orquestar el flujo de procesamiento de pagos webhooks
- **Flujo**:
  1. Consultar detalles del pago (MP API)
  2. Verificar status = "approved"
  3. Filtrar tipo de pago (solo transferencias)
  4. Formatear mensaje
  5. Enviar notificación (Telegram)
- **Beneficios**:
  - Lógica independiente de HTTP
  - Fácil de testear
  - Reutilizable (CLI, cron jobs, etc.)

#### `CheckRecentMovementsUseCase`
```javascript
class CheckRecentMovementsUseCase {
  constructor(mercadoPagoService, telegramService, db) { }
  async execute() { }
}
```
- **Responsabilidad**: Polling periódico para detectar nuevos pagos
- **Flujo**:
  1. Consultar pagos recientes (MP API)
  2. Filtrar aprobados + tipo transferencia
  3. Verificar en Firestore si ya fue procesado
  4. Formatear mensaje
  5. Enviar notificación (Telegram)
  6. Marcar como procesado en Firestore
- **Beneficios**:
  - Detecta pagos que no disparan webhooks (SPEI)
  - Previene duplicados con Firestore
  - Idempotente

### 5. **Dependency Injection**

**Objetivo**: Reducir acoplamiento mediante inyección de dependencias.

```javascript
// Instanciar servicios
const telegramService = new TelegramService(botToken, chatId)
const mercadoPagoService = new MercadoPagoService(accessToken)

// Inyectar en use case
const processPaymentUseCase = new ProcessPaymentWebhookUseCase(
  mercadoPagoService,
  telegramService
)

// Inyectar en controlador
const webhookController = new WebhookController(
  signatureValidator,
  processPaymentUseCase
)
```

**Beneficios**:
- Fácil testing con mocks
- Bajo acoplamiento
- Fácil cambiar implementaciones

### 6. **Single Responsibility Principle (SOLID)**

Cada clase tiene una única responsabilidad:

| Clase | Responsabilidad |
|-------|-----------------|
| `TelegramService` | Solo comunicación con Telegram |
| `MercadoPagoService` | Solo comunicación con Mercado Pago |
| `PaymentMessageFormatter` | Solo formatear mensajes |
| `MercadoPagoSignatureValidator` | Solo validar firmas |
| `ProcessPaymentWebhookUseCase` | Solo orquestar proceso de pago webhook |
| `CheckRecentMovementsUseCase` | Solo polling de pagos recientes |
| `WebhookController` | Solo manejar HTTP requests |

### 7. **Static Factory Pattern**

**Objetivo**: Métodos estáticos para crear/formatear sin mantener estado.

#### `PaymentMessageFormatter`
```javascript
class PaymentMessageFormatter {
  static format(paymentData) { }
  static getPaymentMethodLabel(paymentTypeId) { }
}
```
- **Beneficios**: No necesita instancia, más eficiente

## 📂 Estructura del Proyecto (Modularizada)

```
functions/
├── index.js                              # Entry point & DI container
└── src/
    ├── controllers/
    │   └── WebhookController.js          # HTTP webhook handler
    ├── use-cases/
    │   ├── ProcessPaymentWebhookUseCase.js   # Webhook payment processing
    │   └── CheckRecentMovementsUseCase.js    # Polling for new payments
    ├── services/
    │   ├── TelegramService.js            # Telegram Bot API client
    │   └── MercadoPagoService.js         # Mercado Pago API client
    ├── formatters/
    │   └── PaymentMessageFormatter.js    # Message formatting logic
    └── validators/
        └── SignatureValidator.js         # MP webhook signature validation
```

### index.js - Entry Point

```javascript
// 1. CONFIGURACIÓN
const config = {
  telegram: { botToken, chatId },
  mercadoPago: { secret, accessToken }
}

// 2. IMPORTS
const TelegramService = require('./src/services/TelegramService')
const MercadoPagoService = require('./src/services/MercadoPagoService')
// ... etc

// 3. INSTANCIACIÓN (Dependency Injection)
const telegramService = new TelegramService(config.telegram.botToken, config.telegram.chatId)
const mercadoPagoService = new MercadoPagoService(config.mercadoPago.accessToken)
const signatureValidator = new MercadoPagoSignatureValidator(config.mercadoPago.secret)

const processPaymentUseCase = new ProcessPaymentWebhookUseCase(
  mercadoPagoService,
  telegramService
)

const checkMovementsUseCase = new CheckRecentMovementsUseCase(
  mercadoPagoService,
  telegramService,
  admin.firestore()
)

const webhookController = new WebhookController(
  signatureValidator,
  processPaymentUseCase
)

// 4. CLOUD FUNCTIONS EXPORTS
exports.mpWebhook = functions.region("us-central1")
  .https.onRequest((req, res) => webhookController.handle(req, res))

exports.checkMovements = functions.region("us-central1")
  .pubsub.schedule("every 2 minutes")
  .onRun(async (context) => {
    const result = await checkMovementsUseCase.execute()
    console.log("Resultado:", result)
    return null
  })
```

## 🔒 Seguridad

### Validación de Firma HMAC-SHA256

Mercado Pago firma cada webhook con un secret compartido:

```javascript
// Headers de Mercado Pago
x-signature: ts=1234567890,v1=abc123def456...
x-request-id: uuid-request-id

// Cálculo de firma
manifest = `id:{payment_id};request-id:{x-request-id};ts:{timestamp};`
hash = HMAC-SHA256(manifest, secret)
valid = hash === signature
```

## 📊 Flujo de Datos Completo

### Flujo 1: Webhook (Instant - para operaciones comerciales)

```
1. Mercado Pago → Webhook
   POST https://us-central1-balconcito-payments.cloudfunctions.net/mpWebhook
   Body: { type: "payment", data: { id: "123456" } }
   Headers: { x-signature, x-request-id }

2. WebhookController → Validar
   ├─ Validar método HTTP (POST)
   ├─ Validar firma HMAC-SHA256
   └─ Validar payload (data.id existe)

3. ProcessPaymentWebhookUseCase → Ejecutar
   ├─ MercadoPagoService.getPaymentDetails(id)
   ├─ Verificar status === "approved"
   ├─ Filtrar tipo (solo transferencias: bank_transfer, account_money, ticket)
   ├─ PaymentMessageFormatter.format(data)
   └─ TelegramService.sendMessage(message)

4. TelegramService → Telegram API
   POST https://api.telegram.org/bot{TOKEN}/sendMessage
   Body: { chat_id, text, parse_mode: "Markdown" }

5. Usuario recibe notificación en Telegram
```

### Flujo 2: Polling (Every 2 minutes - para transferencias directas)

```
1. Cloud Scheduler → Trigger every 2 minutes
   PubSub event

2. CheckRecentMovementsUseCase → Ejecutar
   ├─ MercadoPagoService.getRecentPayments(20)
   ├─ Filtrar: status === "approved" && tipo === transferencia
   └─ Para cada pago:
       ├─ Firestore.doc(paymentId).get() → ¿Ya procesado?
       │   ├─ Si existe → SKIP (evitar duplicado)
       │   └─ No existe → Continuar
       ├─ PaymentMessageFormatter.format(data)
       ├─ TelegramService.sendMessage(message)
       └─ Firestore.doc(paymentId).set({ processedAt, amount, date, type })

3. TelegramService → Telegram API
   POST https://api.telegram.org/bot{TOKEN}/sendMessage

4. Usuario recibe notificación en Telegram
```

### Formato del mensaje de notificación

```markdown
💰 PAGO CONFIRMADO

Monto: $150.50
Fecha: 04/11/2025, 18:01:52
ID Transacción: SPEI4001220251104_MBAN01002511040053552627

Método: Transferencia
Estado: Acreditado
```

**Cambios recientes**:
- ✅ Removido campo "Origen" (siempre es la misma cuenta)
- ✅ Fecha real del pago (no hora actual)
- ✅ ID de transacción SPEI visible
- ✅ Intervalo de polling reducido a 2 minutos

## 🧪 Testing (Recomendaciones)

### Unit Tests

```javascript
// Testear servicio aislado
describe('TelegramService', () => {
  it('should send message successfully', async () => {
    const service = new TelegramService(token, chatId)
    const result = await service.sendMessage('Test')
    expect(result.ok).toBe(true)
  })
})

// Testear use case con mocks
describe('ProcessPaymentWebhookUseCase', () => {
  it('should process approved payment', async () => {
    const mockMP = { getPaymentDetails: jest.fn() }
    const mockTelegram = { sendMessage: jest.fn() }
    const useCase = new ProcessPaymentWebhookUseCase(mockMP, mockTelegram)

    await useCase.execute('123')
    expect(mockTelegram.sendMessage).toHaveBeenCalled()
  })
})
```

### Integration Tests

```javascript
// Testear función completa
describe('mpWebhook', () => {
  it('should process real webhook', async () => {
    const req = createMockRequest()
    const res = createMockResponse()
    await webhookController.handle(req, res)
    expect(res.status).toBe(200)
  })
})
```

## 🚀 Escalabilidad

### Agregar nuevos canales de notificación

```javascript
// 1. Crear nuevo servicio
class EmailService {
  async sendEmail(to, subject, body) { }
}

// 2. Inyectar en use case
class ProcessPaymentWebhookUseCase {
  constructor(mpService, telegramService, emailService) {
    this.emailService = emailService
  }

  async execute(paymentId) {
    // ... lógica existente ...
    await this.telegramService.sendMessage(message)
    await this.emailService.sendEmail(email, "Pago", message)
  }
}

// 3. Instanciar
const emailService = new EmailService(config)
const useCase = new ProcessPaymentWebhookUseCase(
  mpService,
  telegramService,
  emailService  // Nuevo
)
```

### Agregar procesamiento asíncrono

```javascript
// Usar Firebase Realtime Database o Firestore
class ProcessPaymentWebhookUseCase {
  async execute(paymentId) {
    // Guardar en DB para procesamiento posterior
    await db.ref(`/pending-payments/${paymentId}`).set({
      status: 'pending',
      createdAt: Date.now()
    })

    // Trigger Cloud Function diferente para procesar
  }
}
```

## 📈 Monitoreo y Logs

### Logs estructurados

```javascript
console.log('Webhook recibido:', JSON.stringify(req.body, null, 2))
console.log(`Consultando detalles del pago ${paymentId}...`)
console.log('✅ Notificación enviada a Telegram')
console.error('❌ Error:', error.message)
```

### Métricas recomendadas

- Total de webhooks recibidos
- Pagos aprobados vs rechazados
- Tiempo de respuesta de APIs externas
- Errores de Telegram vs Mercado Pago
- Tasa de éxito de notificaciones

## 🔧 Mantenimiento

### Actualizar dependencias

```bash
cd functions
npm update
firebase deploy --only functions
```

### Ver logs en tiempo real

```bash
firebase functions:log --project balconcito-payments
```

### Rollback a versión anterior

```bash
# Desde Firebase Console → Functions → Ver historial
# Seleccionar versión anterior y restaurar
```

## 🎓 Principios SOLID Aplicados

| Principio | Implementación |
|-----------|----------------|
| **S**ingle Responsibility | Cada clase tiene una única responsabilidad |
| **O**pen/Closed | Abierto a extensión (agregar servicios), cerrado a modificación |
| **L**iskov Substitution | Los servicios pueden intercambiarse sin romper el código |
| **I**nterface Segregation | Interfaces pequeñas y específicas (sendMessage, getPaymentDetails) |
| **D**ependency Inversion | Dependemos de abstracciones (servicios), no de implementaciones |

## 📚 Referencias

- [Clean Architecture - Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Firebase Cloud Functions Best Practices](https://firebase.google.com/docs/functions/best-practices)
- [Mercado Pago Webhooks](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks)
- [Telegram Bot API](https://core.telegram.org/bots/api)

## 🔧 Servicios de Firebase Utilizados

| Servicio | Propósito | Costo |
|----------|-----------|-------|
| **Cloud Functions** | Webhook HTTP + Scheduled job | Free tier: 2M invocations/month |
| **Cloud Scheduler** | Trigger every 2 minutes | Free tier: 3 jobs |
| **Firestore** | Deduplicación de pagos procesados | Free tier: 1GB storage, 50k reads/day |

### Firestore Schema

**Collection**: `processedPayments`

```javascript
// Document ID: {paymentId} (e.g., "132505542756")
{
  processedAt: 1699123456789,  // timestamp (milliseconds)
  amount: 7,                     // number
  date: "2025-11-04T18:01:52...", // ISO string
  type: "bank_transfer"          // string
}
```

**Propósito**: Evitar enviar notificaciones duplicadas cuando la función de polling detecta el mismo pago múltiples veces.

---

## 🚨 Limitaciones Conocidas

1. **Webhooks de Mercado Pago NO funcionan para:**
   - Transferencias directas/SPEI
   - Depósitos a cuenta de Mercado Pago sin operación comercial
   - **Solución**: Polling cada 2 minutos

2. **Delay máximo de notificación**: 2 minutos (intervalo de polling)

3. **Configuración deprecated**: `functions.config()` será deprecado en marzo 2026
   - **Acción requerida**: Migrar a `.env` antes de esa fecha

---

**Última actualización**: 2025-11-04
**Versión**: 2.0.0 (Modularizado + Dual System)
**Autor**: Claude Code con Daniel Islas
