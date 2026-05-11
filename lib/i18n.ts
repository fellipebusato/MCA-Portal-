// lib/i18n.ts
// Client-facing translations: English, Spanish, Portuguese

export type Lang = "en" | "es" | "pt";

export function tr(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/{(\w+)}/g, (_, k) => String(vars[k] ?? ""));
}

export const T = {
  en: {
    // ── Portal shell ──────────────────────────────────────────────────────────
    portalName: "FB Client Portal",
    signInHeading: "Sign in to your account",
    emailAddress: "Email address",
    password: "Password",
    signInBtn: "Sign in",
    forgotPassword: "Forgot your password?",
    sendResetLink: "Send reset link",
    sending: "Sending…",
    backToSignIn: "← Back to sign in",
    logout: "Logout",
    loading: "Loading your account…",
    noAccount: "No account found",
    noAccountDesc: "No account found for {email}. Please contact Fellipe for access.",
    checkEmail: "Check your email for a password reset link. It expires in 1 hour.",
    enterEmail: "Please enter your email address.",

    // ── Client nav ────────────────────────────────────────────────────────────
    needHelp: "Need help? Contact Fellipe:",
    sendNotice: "Send notice",
    missedPaymentNotice: "Missed payment notice",

    // ── Stats grid ────────────────────────────────────────────────────────────
    funded: "Funded",
    payback: "Payback",
    balance: "Balance",
    dailyPayment: "Daily payment",
    weeklyPayment: "Weekly payment",
    nextACH: "Next ACH: {label}",
    oncePendingClear: "{amount} once {count} pending clear",
    settledOnly: "Settled payments only",

    // ── Next pull card ────────────────────────────────────────────────────────
    nextScheduledPull: "Next scheduled pull",
    haveFundsReady: "Have funds ready by 9 AM",
    estPayoff: "Est. payoff",
    orig: "orig. {date}",

    // ── Pending banner ────────────────────────────────────────────────────────
    pendingMsg: "{count} payment{plural} totaling {amount} are processing and will apply to your balance within 4 business days.",

    // ── Progress bar ──────────────────────────────────────────────────────────
    repaymentProgress: "Repayment progress",
    pctPaid: "{pct}% paid",
    paidAmount: "{amount} paid",
    estCompletion: "Est. completion: {date}",
    remaining: "{amount} remaining",
    actualLegend: "Actual ({pct}%)",
    expectedLegend: "Expected ({pct}%) — {diff}% behind schedule",

    // ── Status banners ────────────────────────────────────────────────────────
    goodStanding: "Account in good standing",
    goodStandingSub: "Your payments are up to date. Keep it up.",
    accountPaused: "Account paused",
    accountPausedSub: "Payments are temporarily paused. ACH will resume on the scheduled end date.",
    accountBlocked: "Account blocked",
    accountBlockedSub: "This account has been blocked. Please contact us immediately.",
    paymentIssues: "Payment issues on file",
    needsAttention: "Account needs attention",
    paymentsMissedWeekly: "1 or more weekly payments have been returned or missed.",
    paymentsMissedDaily: "2 or more daily payments have been returned or missed.",
    payNow: "Pay now online →",
    orZelle: "or Zelle: invoices@cfgms.com",

    // ── Smart alerts ──────────────────────────────────────────────────────────
    alert90: "Final stretch! You're almost paid in full with {count} payment{plural} remaining. When you're done, you're more than welcome to reach out to us for your next funding!",
    alert75: "Almost done! You're 75% of the way through. Just {count} payment{plural} left — and you may qualify for a funding renewal. Ask us about it!",
    alert50: "Halfway there! You've paid off half your balance — and you're now eligible for additional funding. Contact Fellipe to learn more!",
    alert40: "You're almost halfway there! 40% paid and going strong. Stay consistent and you'll hit the 50% mark — and unlock eligibility for additional funding — very soon!",
    alert25: "Great start! You're 25% of the way through. Keep making your payments on time and you'll be done before you know it!",
    alertOnTrack: "You're on track! Only {count} payment{plural} remaining — est. payoff in {weeks} week{weekPlural}. Keep it up!",
    alertBehind: "You're a little behind schedule. Making extra payments now will help you stay on track and protect your payment history.",
    alertOneReturn: "Your payment of {amount} was returned. Make up this payment to keep your account in good standing.",
    alertManyReturns: "You have {count} returned payments totaling {amount}. Resolving these promptly keeps your account protected from going to collections and in Good Standing.",

    // ── Payment panel ─────────────────────────────────────────────────────────
    makePayment: "Make a payment",
    makePaymentSub: "Every extra payment reduces your balance dollar for dollar.",
    payOnline: "Pay online →",
    onlineFee: "⚠️ Online payments carry a 3.5% fee.",
    zelleLabel: "Zelle: invoices@cfgms.com",
    zelleNote: "Include your invoice # or business name — no fee",

    // ── Calendar ──────────────────────────────────────────────────────────────
    paymentCalendar: "Payment Calendar",
    paymentsRemaining: "{count} payments remaining",
    businessDaysTerm: "{count} Business Days Term",
    ends: "Ends {date}",
    calLegendExpected: "Expected",
    calLegendReceived: "Received",
    calLegendMissed: "Missed",
    calLegendHoliday: "Holiday",
    calLegendMoved: "Moved to Monday",

    // ── Mobile tabs ───────────────────────────────────────────────────────────
    tabOverview: "Overview",
    tabHistory: "History",
    tabCalendar: "Calendar",

    // ── Legal ─────────────────────────────────────────────────────────────────
    legal: "This portal is an independent organizational tool operated by Fellipe Busato and is not affiliated with, endorsed by, or operated on behalf of CFG Merchant Solutions or any other entity. Information displayed is for reference and organizational purposes only and does not constitute an official financial record, legal document, or binding statement of account.",
  },

  es: {
    portalName: "FB Portal del Cliente",
    signInHeading: "Inicia sesión en tu cuenta",
    emailAddress: "Correo electrónico",
    password: "Contraseña",
    signInBtn: "Iniciar sesión",
    forgotPassword: "¿Olvidaste tu contraseña?",
    sendResetLink: "Enviar enlace de restablecimiento",
    sending: "Enviando…",
    backToSignIn: "← Volver al inicio de sesión",
    logout: "Cerrar sesión",
    loading: "Cargando tu cuenta…",
    noAccount: "Cuenta no encontrada",
    noAccountDesc: "No se encontró cuenta para {email}. Contacta a Fellipe para obtener acceso.",
    checkEmail: "Revisa tu correo para el enlace de restablecimiento. Expira en 1 hora.",
    enterEmail: "Por favor ingresa tu correo electrónico.",

    needHelp: "¿Necesitas ayuda? Contacta a Fellipe:",
    sendNotice: "Enviar aviso",
    missedPaymentNotice: "Aviso de pago perdido",

    funded: "Financiado",
    payback: "Total a pagar",
    balance: "Saldo",
    dailyPayment: "Pago diario",
    weeklyPayment: "Pago semanal",
    nextACH: "Próximo ACH: {label}",
    oncePendingClear: "{amount} una vez que {count} pendiente se liquide",
    settledOnly: "Solo pagos liquidados",

    nextScheduledPull: "Próximo débito programado",
    haveFundsReady: "Ten fondos disponibles antes de las 9 AM",
    estPayoff: "Pago final estimado",
    orig: "orig. {date}",

    pendingMsg: "{count} pago{plural} por {amount} están procesándose y se aplicarán a tu saldo en 4 días hábiles.",

    repaymentProgress: "Progreso de pago",
    pctPaid: "{pct}% pagado",
    paidAmount: "{amount} pagado",
    estCompletion: "Finalización estimada: {date}",
    remaining: "{amount} restante",
    actualLegend: "Real ({pct}%)",
    expectedLegend: "Esperado ({pct}%) — {diff}% atrasado",

    goodStanding: "Cuenta al corriente",
    goodStandingSub: "Tus pagos están al día. ¡Sigue así!",
    accountPaused: "Cuenta pausada",
    accountPausedSub: "Los pagos están temporalmente pausados. El ACH se reanudará en la fecha programada.",
    accountBlocked: "Cuenta bloqueada",
    accountBlockedSub: "Esta cuenta ha sido bloqueada. Contáctanos de inmediato.",
    paymentIssues: "Problemas de pago registrados",
    needsAttention: "Cuenta requiere atención",
    paymentsMissedWeekly: "1 o más pagos semanales han sido devueltos o perdidos.",
    paymentsMissedDaily: "2 o más pagos diarios han sido devueltos o perdidos.",
    payNow: "Pagar en línea →",
    orZelle: "o Zelle: invoices@cfgms.com",

    alert90: "¡Último tramo! Ya casi terminas con {count} pago{plural} restante. ¡Cuando termines, contáctanos para tu próximo financiamiento!",
    alert75: "¡Casi listo! Llevas el 75% del camino. Solo quedan {count} pago{plural} — ¡podrías calificar para una renovación!",
    alert50: "¡A mitad del camino! Pagaste la mitad de tu saldo — y ahora eres elegible para financiamiento adicional. ¡Contacta a Fellipe!",
    alert40: "¡Ya casi llegas a la mitad! 40% pagado y avanzando bien. ¡Sigue así y pronto alcanzarás el 50%!",
    alert25: "¡Buen comienzo! Llevas el 25% del camino. ¡Sigue pagando a tiempo y terminarás antes de que te des cuenta!",
    alertOnTrack: "¡Vas bien! Solo {count} pago{plural} restante — pago estimado en {weeks} semana{weekPlural}. ¡Sigue así!",
    alertBehind: "Estás un poco atrasado. Hacer pagos adicionales ahora te ayudará a ponerte al día y proteger tu historial.",
    alertOneReturn: "Tu pago de {amount} fue devuelto. Realiza este pago para mantener tu cuenta al corriente.",
    alertManyReturns: "Tienes {count} pagos devueltos por {amount}. Resolverlos rápidamente protege tu cuenta de cobros y la mantiene al corriente.",

    makePayment: "Realizar un pago",
    makePaymentSub: "Cada pago adicional reduce tu saldo dólar por dólar.",
    payOnline: "Pagar en línea →",
    onlineFee: "⚠️ Los pagos en línea tienen un cargo del 3.5%.",
    zelleLabel: "Zelle: invoices@cfgms.com",
    zelleNote: "Incluye tu número de factura o nombre de negocio — sin cargo",

    paymentCalendar: "Calendario de Pagos",
    paymentsRemaining: "{count} pagos restantes",
    businessDaysTerm: "Plazo de {count} días hábiles",
    ends: "Termina {date}",
    calLegendExpected: "Esperado",
    calLegendReceived: "Recibido",
    calLegendMissed: "Perdido",
    calLegendHoliday: "Festivo",
    calLegendMoved: "Movido al lunes",

    tabOverview: "Resumen",
    tabHistory: "Historial",
    tabCalendar: "Calendario",

    legal: "Este portal es una herramienta organizacional independiente operada por Fellipe Busato y no está afiliada, respaldada ni operada en nombre de CFG Merchant Solutions ni de ninguna otra entidad. La información mostrada es solo de referencia y no constituye un registro financiero oficial.",
  },

  pt: {
    portalName: "FB Portal do Cliente",
    signInHeading: "Entre na sua conta",
    emailAddress: "Endereço de e-mail",
    password: "Senha",
    signInBtn: "Entrar",
    forgotPassword: "Esqueceu sua senha?",
    sendResetLink: "Enviar link de redefinição",
    sending: "Enviando…",
    backToSignIn: "← Voltar ao login",
    logout: "Sair",
    loading: "Carregando sua conta…",
    noAccount: "Conta não encontrada",
    noAccountDesc: "Nenhuma conta encontrada para {email}. Entre em contato com Fellipe para obter acesso.",
    checkEmail: "Verifique seu e-mail para o link de redefinição. Expira em 1 hora.",
    enterEmail: "Por favor, insira seu endereço de e-mail.",

    needHelp: "Precisa de ajuda? Entre em contato com Fellipe:",
    sendNotice: "Enviar aviso",
    missedPaymentNotice: "Aviso de pagamento perdido",

    funded: "Financiado",
    payback: "Total a pagar",
    balance: "Saldo",
    dailyPayment: "Pagamento diário",
    weeklyPayment: "Pagamento semanal",
    nextACH: "Próximo ACH: {label}",
    oncePendingClear: "{amount} após {count} pendente compensar",
    settledOnly: "Apenas pagamentos liquidados",

    nextScheduledPull: "Próximo débito programado",
    haveFundsReady: "Tenha fundos disponíveis até as 9h",
    estPayoff: "Quitação estimada",
    orig: "orig. {date}",

    pendingMsg: "{count} pagamento{plural} totalizando {amount} estão sendo processados e serão aplicados ao seu saldo em 4 dias úteis.",

    repaymentProgress: "Progresso do pagamento",
    pctPaid: "{pct}% pago",
    paidAmount: "{amount} pago",
    estCompletion: "Conclusão estimada: {date}",
    remaining: "{amount} restante",
    actualLegend: "Real ({pct}%)",
    expectedLegend: "Esperado ({pct}%) — {diff}% atrasado",

    goodStanding: "Conta em dia",
    goodStandingSub: "Seus pagamentos estão em dia. Continue assim!",
    accountPaused: "Conta pausada",
    accountPausedSub: "Os pagamentos estão temporariamente pausados. O ACH será retomado na data programada.",
    accountBlocked: "Conta bloqueada",
    accountBlockedSub: "Esta conta foi bloqueada. Entre em contato conosco imediatamente.",
    paymentIssues: "Problemas de pagamento registrados",
    needsAttention: "Conta requer atenção",
    paymentsMissedWeekly: "1 ou mais pagamentos semanais foram devolvidos ou perdidos.",
    paymentsMissedDaily: "2 ou mais pagamentos diários foram devolvidos ou perdidos.",
    payNow: "Pagar online →",
    orZelle: "ou Zelle: invoices@cfgms.com",

    alert90: "Reta final! Você está quase quitado com {count} pagamento{plural} restante. Quando terminar, entre em contato para o próximo financiamento!",
    alert75: "Quase lá! Você está 75% do caminho. Só restam {count} pagamento{plural} — você pode se qualificar para uma renovação!",
    alert50: "Na metade do caminho! Você pagou metade do saldo — e agora é elegível para financiamento adicional. Entre em contato com Fellipe!",
    alert40: "Quase na metade! 40% pago e indo bem. Continue assim e logo chegará aos 50%!",
    alert25: "Ótimo começo! Você está 25% do caminho. Continue pagando em dia e terminará antes do previsto!",
    alertOnTrack: "Você está no caminho certo! Apenas {count} pagamento{plural} restante — quitação estimada em {weeks} semana{weekPlural}. Continue assim!",
    alertBehind: "Você está um pouco atrasado. Fazer pagamentos extras agora ajudará a manter o controle e proteger seu histórico.",
    alertOneReturn: "Seu pagamento de {amount} foi devolvido. Regularize este pagamento para manter sua conta em dia.",
    alertManyReturns: "Você tem {count} pagamentos devolvidos totalizando {amount}. Resolva-os rapidamente para proteger sua conta.",

    makePayment: "Fazer um pagamento",
    makePaymentSub: "Cada pagamento extra reduz seu saldo dólar por dólar.",
    payOnline: "Pagar online →",
    onlineFee: "⚠️ Pagamentos online têm uma taxa de 3,5%.",
    zelleLabel: "Zelle: invoices@cfgms.com",
    zelleNote: "Inclua o número da fatura ou nome da empresa — sem taxa",

    paymentCalendar: "Calendário de Pagamentos",
    paymentsRemaining: "{count} pagamentos restantes",
    businessDaysTerm: "Prazo de {count} dias úteis",
    ends: "Termina {date}",
    calLegendExpected: "Esperado",
    calLegendReceived: "Recebido",
    calLegendMissed: "Perdido",
    calLegendHoliday: "Feriado",
    calLegendMoved: "Movido para segunda",

    tabOverview: "Visão Geral",
    tabHistory: "Histórico",
    tabCalendar: "Calendário",

    legal: "Este portal é uma ferramenta organizacional independente operada por Fellipe Busato e não é afiliada, endossada ou operada em nome da CFG Merchant Solutions ou qualquer outra entidade. As informações exibidas são apenas para referência e não constituem um registro financeiro oficial.",
  },
} as const;

export type Translation = { [K in keyof typeof T.en]: string };

export type TranslationKeys = keyof typeof T.en;  // ← this line already exists, add Translation above it
