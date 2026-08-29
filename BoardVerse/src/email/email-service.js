export class EmailService {
  constructor(env) { this.env = env; }
  get configured() { return !!this.env?.RESEND_API_KEY; }
  async send({ to, subject, html }) {
    if (!this.env?.RESEND_API_KEY) throw new Error("RESEND_API_KEY 尚未設定。");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: "BoardVerse <no-reply@auth.ray2025.com>", to: [to], subject, html }),
    });
    if (!response.ok) throw new Error("Email 服務暫時無法寄送，請稍後重試。");
    return response.json().catch(() => ({}));
  }
}
