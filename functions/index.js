const functions = require("firebase-functions")
const admin = require("firebase-admin")

// Inicializar Firebase Admin
admin.initializeApp()

// ============================================
// IMPORTS
// ============================================
const TelegramService = require('./src/services/TelegramService')
const MercadoPagoService = require('./src/services/MercadoPagoService')
const MercadoPagoSignatureValidator = require('./src/validators/SignatureValidator')
const ProcessPaymentWebhookUseCase = require('./src/use-cases/ProcessPaymentWebhookUseCase')
const CheckRecentMovementsUseCase = require('./src/use-cases/CheckRecentMovementsUseCase')
const WebhookController = require('./src/controllers/WebhookController')

// ============================================
// CONFIGURACIÓN
// ============================================
const config = {
  telegram: {
    botToken: functions.config().telegram?.bot_token || "",
    chatId: functions.config().telegram?.chat_id || "",
  },
  mercadoPago: {
    secret: functions.config().mercadopago?.secret || "",
    accessToken: functions.config().mercadopago?.access_token || "",
  },
}

// ============================================
// INSTANCIACIÓN DE SERVICIOS
// ============================================

// Servicios externos
const telegramService = new TelegramService(
  config.telegram.botToken,
  config.telegram.chatId
)

const mercadoPagoService = new MercadoPagoService(
  config.mercadoPago.accessToken
)

// Validadores
const signatureValidator = new MercadoPagoSignatureValidator(
  config.mercadoPago.secret
)

// Casos de uso
const processPaymentUseCase = new ProcessPaymentWebhookUseCase(
  mercadoPagoService,
  telegramService
)

const checkMovementsUseCase = new CheckRecentMovementsUseCase(
  mercadoPagoService,
  telegramService,
  admin.firestore()
)

// Controladores
const webhookController = new WebhookController(
  signatureValidator,
  processPaymentUseCase
)

// ============================================
// CLOUD FUNCTIONS EXPORTS
// ============================================

/**
 * Webhook HTTP para recibir notificaciones de Mercado Pago
 * Trigger: HTTPS POST request
 * URL: https://us-central1-{PROJECT_ID}.cloudfunctions.net/mpWebhook
 */
exports.mpWebhook = functions
  .region("us-central1")
  .https.onRequest((req, res) => webhookController.handle(req, res))

/**
 * Función programada para revisar pagos recientes
 * Trigger: Cloud Scheduler (cada 2 minutos)
 * Propósito: Detectar transferencias directas que no disparan webhooks
 */
exports.checkMovements = functions
  .region("us-central1")
  .pubsub.schedule("every 2 minutes")
  .onRun(async (context) => {
    const result = await checkMovementsUseCase.execute()
    console.log("Resultado:", result)
    return null
  })
