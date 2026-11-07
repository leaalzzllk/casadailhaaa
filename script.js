const bookingForm = document.querySelector("#booking-form");
const checkinInput = document.querySelector("#checkin");
const checkoutInput = document.querySelector("#checkout");
const guestsInput = document.querySelector("#guests");
const guestNameInput = document.querySelector("#guest-name");
const guestEmailInput = document.querySelector("#guest-email");
const guestPhoneInput = document.querySelector("#guest-phone");
const bookingFeedback = document.querySelector("#booking-feedback");
const securityFeedback = document.querySelector("#security-feedback");
const bookingSubmit = bookingForm.querySelector('button[type="submit"]');
const confirmationDialog = document.querySelector("#confirmation-dialog");
const confirmationMessage = document.querySelector("#confirmation-message");
const confirmationWhatsAppLink = document.querySelector("#confirmation-whatsapp-link");
const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
const whatsappLink = document.querySelector("#whatsapp-link");
let supabaseClient;
let bookingSettings;
let turnstileWidgetId;
let turnstileToken = "";
let turnstileApiPromise;
let bookingProtectionReady = false;
let whatsappOwnerDigits = "";

const today = new Date();
const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
  .toISOString()
  .slice(0, 10);
checkinInput.min = localDate;
checkoutInput.min = localDate;
document.querySelector("#current-year").textContent = String(today.getFullYear());

function setBookingFeedback(message, status = "") {
  bookingFeedback.textContent = message;
  bookingFeedback.classList.toggle("is-error", status === "error");
  bookingFeedback.classList.toggle("is-result", status === "result");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function describeBookingError(error) {
  if (error.functionCode === "rate_limited" || error.status === 429) {
    return "Recebemos muitas tentativas deste acesso. Aguarde 15 minutos e tente novamente.";
  }
  if (error.functionCode === "challenge_failed") return "A verificação de segurança expirou. Confirme novamente e tente enviar.";
  if (error.functionCode === "protection_unavailable") return "A proteção contra envios automáticos está temporariamente indisponível. Tente novamente em instantes.";
  if (error.functionCode === "service_not_configured" || error.functionCode === "reservation_service_unavailable") {
    return "O serviço de reservas está temporariamente indisponível. Avise a hospedagem para verificar a configuração.";
  }
  if (error.functionCode === "invalid_request") return "Confira os dados, aceite o aviso de privacidade e conclua a verificação de segurança.";
  if (error.functionCode === "stay_dates_unavailable" || error.status === 409) {
    return "Essas datas já receberam outro pedido ou estão reservadas. Escolha um novo período.";
  }
  if (error.functionCode === "booking_prices_not_configured") {
    return "A hospedagem ainda está configurando os preços. Tente novamente mais tarde.";
  }
  if (error.code === "23P01" || error.message?.includes("stay_dates_unavailable")) {
    return "Essas datas já receberam outro pedido ou estão reservadas. Escolha um novo período.";
  }
  if (error.message?.includes("booking_prices_not_configured")) {
    return "A hospedagem ainda está configurando os preços. Tente novamente mais tarde.";
  }
  if (error.message?.includes("invalid_stay_dates")) return "Escolha datas futuras e confira o check-in e o check-out.";
  if (error.message?.includes("invalid_guest_count")) return "A quantidade de hóspedes excede a capacidade da hospedagem.";
  if (error.message?.includes("invalid_guest_email")) return "Confira o e-mail informado.";
  if (error.message?.includes("invalid_guest_phone")) return "Informe um telefone com DDD e, no mínimo, 10 dígitos.";
  if (error.message?.includes("invalid_guest_name")) return "Informe seu nome para solicitar a reserva.";
  if (error.message?.includes("stay_too_long")) return "Para estadias acima de 90 noites, fale diretamente com a hospedagem.";
  return "Não foi possível enviar seu pedido agora. Confira sua conexão e tente novamente.";
}

function updateCheckoutMinimum() {
  const nextAvailableDate = checkinInput.value || localDate;
  const nextDay = new Date(`${nextAvailableDate}T12:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  const minimumCheckout = new Date(nextDay.getTime() - nextDay.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  checkoutInput.min = minimumCheckout;

  if (checkoutInput.value && checkoutInput.value <= checkinInput.value) {
    checkoutInput.value = "";
  }
}

function updateGuestOptions(maxGuests) {
  const selectedGuests = Number(guestsInput.value) || 2;
  guestsInput.replaceChildren();
  for (let count = 1; count <= maxGuests; count += 1) {
    const option = document.createElement("option");
    option.value = String(count);
    option.textContent = `${count} ${count === 1 ? "hóspede" : "hóspedes"}`;
    guestsInput.append(option);
  }
  guestsInput.value = String(Math.min(selectedGuests, maxGuests));
}

function updateWhatsAppLink(phone) {
  const rawDigits = phone.replace(/\D/g, "");
  const digits = rawDigits.length === 10 || rawDigits.length === 11 ? `55${rawDigits}` : rawDigits;
  if (digits.length < 10 || digits.length > 15) {
    whatsappOwnerDigits = "";
    whatsappLink.hidden = true;
    return;
  }
  whatsappOwnerDigits = digits;
  const message = encodeURIComponent("Olá! Gostaria de saber mais sobre a hospedagem em Ilhabela.");
  whatsappLink.href = `https://wa.me/${digits}?text=${message}`;
  whatsappLink.hidden = false;
}

function updateBookingButtonState() {
  bookingSubmit.disabled = !bookingSettings
    || bookingSettings.nightly_rate <= 0
    || !bookingProtectionReady
    || !turnstileToken;
}

function loadTurnstileApi() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileApiPromise) return turnstileApiPromise;

  turnstileApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile loaded without exposing its API."));
    };
    script.onerror = () => reject(new Error("Could not load the Turnstile verification."));
    document.head.append(script);
  });
  return turnstileApiPromise;
}

async function initializeBookingProtection(siteKey) {
  if (!siteKey || siteKey.includes("COLE_A_CHAVE")) {
    securityFeedback.textContent = "A proteção de segurança ainda não foi configurada. As reservas online estão pausadas.";
    securityFeedback.classList.add("is-error");
    updateBookingButtonState();
    return;
  }

  try {
    const turnstile = await loadTurnstileApi();
    turnstileWidgetId = turnstile.render("#turnstile-widget", {
      sitekey: siteKey,
      action: "booking",
      language: "pt-br",
      callback: (token) => {
        turnstileToken = token;
        bookingProtectionReady = true;
        securityFeedback.textContent = "Verificação concluída. Você já pode enviar o pedido.";
        securityFeedback.classList.remove("is-error");
        securityFeedback.classList.add("is-ready");
        updateBookingButtonState();
      },
      "expired-callback": () => {
        turnstileToken = "";
        securityFeedback.textContent = "A verificação expirou. Confirme novamente antes de enviar.";
        securityFeedback.classList.remove("is-ready");
        updateBookingButtonState();
      },
      "error-callback": () => {
        turnstileToken = "";
        bookingProtectionReady = false;
        securityFeedback.textContent = "Não foi possível concluir a verificação. Recarregue a página e tente novamente.";
        securityFeedback.classList.remove("is-ready");
        securityFeedback.classList.add("is-error");
        updateBookingButtonState();
      },
    });
    bookingProtectionReady = true;
    securityFeedback.textContent = "Conclua a verificação para liberar o envio do pedido.";
    securityFeedback.classList.remove("is-error", "is-ready");
  } catch (error) {
    console.error("Falha ao carregar a proteção contra envios automáticos:", error);
    bookingProtectionReady = false;
    securityFeedback.textContent = "A verificação de segurança não carregou. Verifique a conexão e recarregue a página.";
    securityFeedback.classList.add("is-error");
  }
  updateBookingButtonState();
}

async function readFunctionError(error) {
  const status = error.context?.status;
  try {
    if (typeof error.context?.clone === "function") {
      const body = await error.context.clone().json();
      return { status, functionCode: body.error };
    }
  } catch (parseError) {
    console.error("Não foi possível ler a resposta de erro do serviço de reservas:", parseError);
  }
  return { status };
}

function updateSiteContent(settings) {
  const propertyDescription = document.querySelector("#property-description");
  const locationDescription = document.querySelector("#location-description");
  const locationAddress = document.querySelector("#location-address");
  const mapLinks = [
    document.querySelector("#location-map-link"),
    document.querySelector("#location-map-image-link"),
  ];

  if (typeof settings.property_description === "string" && settings.property_description.trim()) {
    propertyDescription.textContent = settings.property_description;
  }
  if (typeof settings.location_description === "string" && settings.location_description.trim()) {
    locationDescription.textContent = settings.location_description;
  }
  if (typeof settings.public_address === "string" && settings.public_address.trim()) {
    locationAddress.textContent = settings.public_address;
    mapLinks[1].setAttribute("aria-label", `Ver ${settings.public_address} no mapa`);
  }

  if (typeof settings.maps_url === "string" && settings.maps_url.trim()) {
    try {
      const mapsUrl = new URL(settings.maps_url);
      if (mapsUrl.protocol === "https:") {
        mapLinks.forEach((link) => { link.href = mapsUrl.href; });
      }
    } catch {
      console.error("O link do mapa salvo nas configurações não é válido.");
    }
  }

  const stayDetails = document.querySelector("#informacoes-estadia");
  const publicDetails = [
    ["checkin_time", "#checkin-detail", "#checkin-time-display", (value) => `A partir das ${value}`],
    ["checkout_time", "#checkout-detail", "#checkout-time-display", (value) => `Até ${value}`],
    ["house_rules", "#house-rules-detail", "#house-rules-display", (value) => value],
    ["payment_policy", "#payment-policy-detail", "#payment-policy-display", (value) => value],
    ["cancellation_policy", "#cancellation-policy-detail", "#cancellation-policy-display", (value) => value],
  ];

  let hasStayDetails = false;
  for (const [setting, cardSelector, textSelector, format] of publicDetails) {
    const value = typeof settings[setting] === "string" ? settings[setting].trim() : "";
    const card = document.querySelector(cardSelector);
    card.hidden = !value;
    if (value) {
      document.querySelector(textSelector).textContent = format(value);
      hasStayDetails = true;
    }
  }
  stayDetails.hidden = !hasStayDetails;
}

function updateSitePhotos(settings) {
  const heroImage = document.querySelector('[data-site-photo="hero"]');
  const heroImageNote = document.querySelector("#hero-image-note");
  const configuredHero = typeof settings.hero_image_path === "string" && settings.hero_image_path.length > 0;
  const galleryPaths = Array.isArray(settings.gallery_image_paths) ? settings.gallery_image_paths : [];
  const galleryAlts = Array.isArray(settings.gallery_image_alts) ? settings.gallery_image_alts : [];
  const hasConfiguredGallery = galleryPaths.some((path) => typeof path === "string" && path.length > 0);

  if (configuredHero) {
    heroImage.dataset.fallbackSrc ||= heroImage.src;
    heroImage.src = supabaseClient.storage
      .from("casa-da-ilha-images")
      .getPublicUrl(settings.hero_image_path)
      .data.publicUrl;
    heroImage.alt = settings.hero_image_alt || "Paisagem da hospedagem em Ilhabela";
    heroImage.addEventListener("error", () => {
      heroImage.src = heroImage.dataset.fallbackSrc;
      heroImage.alt = "Imagem ilustrativa de praia tropical em tons de azul";
      heroImageNote.hidden = false;
    }, { once: true });
  }
  heroImageNote.hidden = configuredHero;

  for (let index = 0; index < 5; index += 1) {
    const image = document.querySelector(`[data-site-photo="${index}"]`);
    const path = galleryPaths[index];
    if (typeof path !== "string" || path.length === 0) continue;

    image.dataset.fallbackSrc ||= image.src;
    image.src = supabaseClient.storage.from("casa-da-ilha-images").getPublicUrl(path).data.publicUrl;
    if (typeof galleryAlts[index] === "string" && galleryAlts[index].length > 0) {
      image.alt = galleryAlts[index];
    }
    image.addEventListener("error", () => {
      image.src = image.dataset.fallbackSrc;
      image.alt = "Imagem ilustrativa da hospedagem";
    }, { once: true });
  }

  const galleryDisclaimer = document.querySelector("#gallery-disclaimer");
  const allPhotosConfigured = configuredHero && galleryPaths.length >= 5
    && galleryPaths.slice(0, 5).every((path) => typeof path === "string" && path.length > 0);
  galleryDisclaimer.hidden = allPhotosConfigured;
  if (!allPhotosConfigured && (configuredHero || hasConfiguredGallery)) {
    galleryDisclaimer.textContent =
      "Algumas imagens são ilustrativas. A equipe da hospedagem pode publicar fotos reais do chalé pelo painel administrativo.";
  }
}

function updatePriceEstimate() {
  if (!bookingSettings || bookingSettings.nightly_rate <= 0) {
    setBookingFeedback("A hospedagem está configurando os valores. Consulte novamente em breve.");
    updateBookingButtonState();
    return;
  }
  updateBookingButtonState();

  if (!checkinInput.value || !checkoutInput.value || checkoutInput.value <= checkinInput.value) {
    setBookingFeedback(
      `Tarifas a partir de ${formatCurrency(bookingSettings.nightly_rate)} por noite · até ${bookingSettings.max_guests} hóspedes.`,
    );
    return;
  }

  const nights = Math.round(
    (new Date(`${checkoutInput.value}T12:00:00`) - new Date(`${checkinInput.value}T12:00:00`)) / 86_400_000,
  );
  const total = nights * bookingSettings.nightly_rate + bookingSettings.cleaning_fee;
  setBookingFeedback(
    `${nights} ${nights === 1 ? "noite" : "noites"} · Estimativa total: ${formatCurrency(total)} (inclui taxa de limpeza).`,
    "result",
  );
}

async function loadBookingSettings() {
  const config = window.CASA_DA_ILHA_CONFIG;
  if (!config || !config.supabaseUrl || !config.supabaseAnonKey
    || config.supabaseUrl.includes("SEU-PROJETO")
    || config.supabaseAnonKey.includes("COLE_A_CHAVE")) {
    setBookingFeedback("Estamos preparando as reservas online. Fale diretamente com a hospedagem para consultar as datas.", "error");
    return;
  }

  if (!window.supabase?.createClient) {
    setBookingFeedback("O sistema de reservas está temporariamente indisponível. Tente novamente mais tarde.", "error");
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data, error } = await supabaseClient
      .from("site_settings")
      .select("nightly_rate, cleaning_fee, max_guests, whatsapp, property_description, public_address, location_description, maps_url, checkin_time, checkout_time, house_rules, payment_policy, cancellation_policy, hero_image_path, hero_image_alt, gallery_image_paths, gallery_image_alts")
      .eq("id", 1)
      .single();
    if (error) throw error;

    bookingSettings = {
      nightly_rate: Number(data.nightly_rate),
      cleaning_fee: Number(data.cleaning_fee),
      max_guests: Number(data.max_guests),
    };
    updateGuestOptions(bookingSettings.max_guests);
    updateWhatsAppLink(data.whatsapp ?? "");
    updateSiteContent(data);
    updateSitePhotos(data);
    await initializeBookingProtection(config.turnstileSiteKey);
    updatePriceEstimate();
  } catch (error) {
    setBookingFeedback("Não foi possível carregar as informações de reserva. A hospedagem pode precisar concluir a configuração do sistema.", "error");
    bookingSubmit.disabled = true;
    console.error("Falha ao carregar as tarifas da hospedagem:", error);
  }
}

checkinInput.addEventListener("change", () => {
  updateCheckoutMinimum();
  updatePriceEstimate();
});
checkoutInput.addEventListener("change", updatePriceEstimate);
guestsInput.addEventListener("change", updatePriceEstimate);

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!bookingForm.reportValidity()) return;
  if (bookingForm.elements.website.value.trim()) {
    console.warn("Pedido bloqueado pelo campo de validação automática.");
    setBookingFeedback("Não foi possível enviar o pedido. Confira os dados e tente novamente.", "error");
    return;
  }
  if (!supabaseClient || !bookingSettings) {
    setBookingFeedback("As reservas online ainda não estão configuradas. Tente novamente mais tarde.", "error");
    return;
  }
  if (!bookingProtectionReady || !turnstileToken) {
    securityFeedback.textContent = "Conclua a verificação de segurança antes de enviar o pedido.";
    securityFeedback.classList.add("is-error");
    return;
  }

  bookingSubmit.disabled = true;
  bookingSubmit.textContent = "Enviando pedido…";

  try {
    const { data, error } = await supabaseClient.functions.invoke("create-reservation", {
      body: {
        guest_name: guestNameInput.value.trim(),
        guest_email: guestEmailInput.value.trim(),
        guest_phone: guestPhoneInput.value.trim(),
        checkin: checkinInput.value,
        checkout: checkoutInput.value,
        guests: Number(guestsInput.value),
        privacy_consent: document.querySelector("#privacy-consent").checked,
        turnstile_token: turnstileToken,
        website: bookingForm.elements.website.value,
      },
    });
    if (error) {
      const functionError = await readFunctionError(error);
      throw {
        code: error.code,
        message: error.message,
        status: functionError.status,
        functionCode: functionError.functionCode,
      };
    }

    const reservation = data.reservation;
    const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });
    const dates = `${dateFormatter.format(new Date(`${checkinInput.value}T12:00:00`))} a ${dateFormatter.format(new Date(`${checkoutInput.value}T12:00:00`))}`;
    confirmationMessage.textContent =
      `${dates} · ${Number(guestsInput.value)} ${Number(guestsInput.value) === 1 ? "hóspede" : "hóspedes"} · ${reservation.nights} ${reservation.nights === 1 ? "noite" : "noites"}. Estimativa: ${formatCurrency(Number(reservation.total))}. Seu pedido foi salvo; a hospedagem ainda precisa confirmar a disponibilidade.`;
    const whatsappMessage = [
      "Olá! Acabei de enviar um pedido de reserva pelo site do Chalé Azul.",
      `Nome: ${guestNameInput.value.trim()}`,
      `WhatsApp: ${guestPhoneInput.value.trim()}`,
      `E-mail: ${guestEmailInput.value.trim()}`,
      `Período: ${dates}`,
      `Hóspedes: ${Number(guestsInput.value)}`,
      `Estimativa: ${formatCurrency(Number(reservation.total))}`,
      "Por favor, confirme a disponibilidade.",
    ].join("\n");
    confirmationWhatsAppLink.href = whatsappOwnerDigits
      ? `https://wa.me/${whatsappOwnerDigits}?text=${encodeURIComponent(whatsappMessage)}`
      : "#";
    confirmationWhatsAppLink.hidden = !whatsappOwnerDigits;
    confirmationDialog.showModal();
    bookingForm.reset();
    updateCheckoutMinimum();
    updatePriceEstimate();
  } catch (error) {
    console.error("Falha ao enviar pedido de reserva:", error);
    setBookingFeedback(describeBookingError(error), "error");
  } finally {
    turnstileToken = "";
    if (window.turnstile && turnstileWidgetId !== undefined) {
      window.turnstile.reset(turnstileWidgetId);
      securityFeedback.textContent = "Confirme novamente a verificação para enviar outro pedido.";
      securityFeedback.classList.remove("is-ready");
    }
    bookingSubmit.innerHTML = 'Consultar estadia <span aria-hidden="true">→</span>';
    updateBookingButtonState();
  }
});

function closeMenu() {
  mainNav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Abrir menu");
}

menuToggle.addEventListener("click", () => {
  const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isExpanded));
  menuToggle.setAttribute("aria-label", isExpanded ? "Abrir menu" : "Fechar menu");
  mainNav.classList.toggle("is-open", !isExpanded);
});
mainNav.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) closeMenu();
});

confirmationDialog.querySelector(".dialog-close").addEventListener("click", () => confirmationDialog.close());
confirmationDialog.querySelector(".dialog-done").addEventListener("click", () => confirmationDialog.close());
confirmationDialog.addEventListener("click", (event) => {
  if (event.target === confirmationDialog) confirmationDialog.close();
});

loadBookingSettings();
