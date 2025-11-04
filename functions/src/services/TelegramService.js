/**
 * Servicio de Telegram
 * Responsabilidad: Comunicación con la API de Telegram
 */
class TelegramService {
  constructor(botToken, chatId) {
    this.botToken = botToken
    this.chatId = chatId
    this.apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
  }

  async sendMessage(text) {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: "Markdown",
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(`Telegram API error: ${data.description}`)
    }

    return data
  }
}

module.exports = TelegramService
