const reservationsList = document.querySelector("#reservations-list");
const storageError = document.querySelector("#storage-error");
const searchInput = document.querySelector("#search-reservations");
const statusFilter = document.querySelector("#status-filter");
const exportButton = document.querySelector("#export-button");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const loginPanel = document.querySelector("#login-panel");
const dashboard = document.querySelector("#admin-dashboard");
const connectionNotice = document.querySelector("#connection-notice");
const logoutButton = document.querySelector("#logout-button");
const settingsForm = document.querySelector("#settings-form");
const settingsMessage = document.querySelector("#settings-message");
const contentSettingsForm = document.querySelector("#content-settings-form");
const contentSettingsMessage = document.querySelector("#content-settings-message");
const passwordInput = document.querySelector("#admin-password");
const resetPasswordButton = document.querySelector("#reset-password-button");
const recoveryForm = document.querySelector("#password-recovery-form");
const recoveryMessage = document.querySelector("#recovery-message");
const photosPanel = document.querySelector(".photo-grid");
const photoBucket = "casa-da-ilha-images";
const maxPhotoSize = 20 * 1024 * 1024;
const maxStoredPhotoSize = 8 * 1024 * 1024;
const validStatuses = ["requested", "confirmed", "declined"];
const statusLabels = {
  requested: "Solicitada",
  confirmed: "Confirmada",
  declined: "Recusada",
};
let supabaseClient;
let reservations = [];
let currentSettings;
let photoSaveInProgress = false;

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value, options = { day: "numeric", month: "short", year: "numeric" }) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Data inválida" : new Intl.DateTimeFormat("pt-BR", options).format(date);
}

function setError(message) {
  storageError.hidden = false;
  storageError.textContent = message;
}

function updateStats() {
  const requested = reservations.filter((reservation) => reservation.status === "requested").length;
  const confirmed = reservations.filter((reservation) => reservation.status === "confirmed");
  document.querySelector("#stat-total").textContent = String(reservations.length);
  document.querySelector("#stat-new").textContent = String(requested);
  document.querySelector("#stat-confirmed").textContent = String(confirmed.length);
  document.querySelector("#stat-value").textContent = formatCurrency(
    confirmed.reduce((sum, reservation) => sum + Number(reservation.total), 0),
  );
}

function reservationCard(reservation) {
  const options = validStatuses.map((status) =>
    `<option value="${status}"${reservation.status === status ? " selected" : ""}>${statusLabels[status]}</option>`,
  ).join("");

  return `<article class="reservation-card" data-id="${reservation.id}">
    <div class="reservation-person">
      <span class="reservation-label">HÓSPEDE</span>
      <span class="guest-name">${escapeHtml(reservation.guest_name)}</span>
      <span class="guest-meta">${escapeHtml(reservation.guest_email)} · ${escapeHtml(reservation.guest_phone)}</span>
    </div>
    <div class="reservation-dates">
      <span class="reservation-label">ESTADIA</span>
      <span class="guest-name">${escapeHtml(formatDate(reservation.checkin))}</span>
      <span class="reservation-date">até ${escapeHtml(formatDate(reservation.checkout))}</span>
    </div>
    <div class="reservation-stay">
      <span class="reservation-label">HÓSPEDES / NOITES</span>
      <span class="guest-name">${Number(reservation.guests)} ${Number(reservation.guests) === 1 ? "hóspede" : "hóspedes"}</span>
      <span class="stay-details">${Number(reservation.nights)} ${Number(reservation.nights) === 1 ? "noite" : "noites"}</span>
    </div>
    <div class="reservation-total">
      <span class="reservation-label">ESTIMATIVA</span>
      <span class="guest-name">${escapeHtml(formatCurrency(Number(reservation.total)))}</span>
    </div>
    <label class="reservation-status">
      <span class="reservation-label">STATUS</span>
      <select class="status-select" aria-label="Status do pedido de ${escapeHtml(reservation.guest_name)}">${options}</select>
    </label>
    <button class="delete-button" type="button" aria-label="Excluir pedido de ${escapeHtml(reservation.guest_name)}" title="Excluir pedido">×</button>
  </article>`;
}

function render() {
  updateStats();
  const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");
  const selectedStatus = statusFilter.value;
  const filtered = reservations
    .filter((reservation) => selectedStatus === "Todas" || reservation.status === selectedStatus)
    .filter((reservation) =>
      `${reservation.guest_name} ${reservation.guest_email} ${reservation.guest_phone}`
        .toLocaleLowerCase("pt-BR")
        .includes(query),
    );

  document.querySelector("#results-count").textContent =
    `${filtered.length} ${filtered.length === 1 ? "pedido" : "pedidos"}`;

  if (filtered.length === 0) {
    const hasFilters = query !== "" || selectedStatus !== "Todas";
    reservationsList.innerHTML = `<div class="empty-state"><span class="empty-icon" aria-hidden="true">⌂</span><h3>${hasFilters ? "Nenhum pedido encontrado" : "Ainda não chegaram pedidos"}</h3><p>${hasFilters ? "Tente mudar os filtros da busca." : "Quando alguém solicitar uma reserva pelo site, ela aparecerá aqui."}</p></div>`;
    return;
  }
  reservationsList.innerHTML = filtered.map(reservationCard).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}

function describeConnectionError(error) {
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code)) {
    return "O banco está sem tabelas ou colunas necessárias. Execute a versão atualizada de supabase-schema.sql no SQL Editor do seu projeto Supabase.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "O banco recusou o acesso. Confira as políticas de acesso e a configuração do administrador.";
  }
  return "Não foi possível carregar os dados do Supabase. Confira a conexão e se as tabelas foram configuradas.";
}

async function loadDashboardData() {
  storageError.hidden = true;
  const [reservationResult, settingsResult] = await Promise.all([
    supabaseClient
      .from("reservations")
      .select("id, guest_name, guest_email, guest_phone, checkin, checkout, guests, nights, total, status, created_at")
      .order("created_at", { ascending: false }),
    supabaseClient
      .from("site_settings")
      .select("nightly_rate, cleaning_fee, max_guests, whatsapp, property_description, public_address, location_description, maps_url, checkin_time, checkout_time, house_rules, payment_policy, cancellation_policy, hero_image_path, hero_image_alt, gallery_image_paths, gallery_image_alts")
      .eq("id", 1)
      .single(),
  ]);
  if (reservationResult.error) throw reservationResult.error;
  if (settingsResult.error) throw settingsResult.error;
  reservations = reservationResult.data;
  currentSettings = settingsResult.data;
  render();
  populateSettings(currentSettings);
}

function populateSettings(settings) {
  document.querySelector("#nightly-rate").value = settings.nightly_rate > 0 ? settings.nightly_rate : "";
  document.querySelector("#cleaning-fee").value = settings.cleaning_fee;
  document.querySelector("#max-guests").value = settings.max_guests;
  document.querySelector("#whatsapp-number").value = settings.whatsapp ?? "";
  document.querySelector("#property-description").value = settings.property_description ?? "";
  document.querySelector("#public-address").value = settings.public_address ?? "";
  document.querySelector("#location-description").value = settings.location_description ?? "";
  document.querySelector("#maps-url").value = settings.maps_url ?? "";
  document.querySelector("#checkin-time").value = settings.checkin_time ?? "";
  document.querySelector("#checkout-time").value = settings.checkout_time ?? "";
  document.querySelector("#house-rules").value = settings.house_rules ?? "";
  document.querySelector("#payment-policy").value = settings.payment_policy ?? "";
  document.querySelector("#cancellation-policy").value = settings.cancellation_policy ?? "";
  const galleryPaths = Array.isArray(settings.gallery_image_paths) ? settings.gallery_image_paths : [];
  const galleryAlts = Array.isArray(settings.gallery_image_alts) ? settings.gallery_image_alts : [];
  updatePhotoSlot("hero", settings.hero_image_path, settings.hero_image_alt);
  for (let index = 0; index < 5; index += 1) {
    updatePhotoSlot(String(index), galleryPaths[index], galleryAlts[index]);
  }
}

function updatePhotoSlot(slotName, path, alt) {
  const slot = photosPanel.querySelector(`[data-photo-slot="${slotName}"]`);
  const preview = slot.querySelector(".photo-preview");
  const image = slot.querySelector(".photo-preview-image");
  const hasImage = typeof path === "string" && path.length > 0;
  const photoAlt = typeof alt === "string" ? alt : "";
  if (hasImage) {
    image.src = supabaseClient.storage.from(photoBucket).getPublicUrl(path).data.publicUrl;
    image.alt = photoAlt || slot.querySelector(".photo-slot-content > strong").textContent;
  } else {
    image.removeAttribute("src");
    image.alt = "";
  }
  preview.classList.toggle("has-image", hasImage);
  slot.querySelector(".photo-alt-input").value = photoAlt;
  slot.querySelector(".photo-remove-button").hidden = !hasImage;
}

function setPhotoStatus(slot, message, status = "") {
  const output = slot.querySelector(".photo-upload-status");
  output.textContent = message;
  output.classList.toggle("is-error", status === "error");
  output.classList.toggle("is-busy", status === "busy");
}

function getUpdatedPhotoSettings(slotName, newPath, altText) {
  if (slotName === "hero") {
    return {
      hero_image_path: newPath,
      hero_image_alt: altText || "Paisagem da hospedagem em Ilhabela",
    };
  }

  const index = Number(slotName);
  const paths = Array.from({ length: 5 }, (_, itemIndex) => currentSettings.gallery_image_paths?.[itemIndex] ?? "");
  const alts = Array.from({ length: 5 }, (_, itemIndex) => currentSettings.gallery_image_alts?.[itemIndex] ?? "");
  paths[index] = newPath;
  alts[index] = altText;
  return { gallery_image_paths: paths, gallery_image_alts: alts };
}

async function savePhoto(slot, newPath, altText) {
  const slotName = slot.dataset.photoSlot;
  const oldPath = slotName === "hero"
    ? currentSettings.hero_image_path
    : currentSettings.gallery_image_paths?.[Number(slotName)];
  const updates = getUpdatedPhotoSettings(slotName, newPath, altText);
  const { data, error } = await supabaseClient
    .from("site_settings")
    .update(updates)
    .eq("id", 1)
    .select("nightly_rate, cleaning_fee, max_guests, whatsapp, property_description, public_address, location_description, maps_url, checkin_time, checkout_time, house_rules, payment_policy, cancellation_policy, hero_image_path, hero_image_alt, gallery_image_paths, gallery_image_alts")
    .single();

  if (error) throw error;

  currentSettings = data;
  populateSettings(currentSettings);
  if (oldPath && oldPath !== newPath) {
    const { error: deleteError } = await supabaseClient.storage.from(photoBucket).remove([oldPath]);
    if (deleteError) {
      console.error("A foto foi atualizada, mas o arquivo antigo não pôde ser removido:", deleteError);
      setPhotoStatus(slot, "Foto publicada. A versão anterior não pôde ser removida; verifique o armazenamento.", "error");
      return;
    }
  }

  setPhotoStatus(slot, newPath ? "Foto publicada no site." : "Foto removida do site.");
}

async function optimizePhoto(file) {
  if (typeof createImageBitmap !== "function") {
    if (file.size > maxStoredPhotoSize) {
      throw new Error("Este navegador não pode otimizar fotos. Use uma imagem com até 8 MB.");
    }
    return file;
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2400 / bitmap.width, 1800 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar esta foto no navegador.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const webp = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Não foi possível otimizar esta foto. Tente outra imagem."));
      }, "image/webp", 0.84);
    });
    if (webp.type !== "image/webp") {
      if (file.size > maxStoredPhotoSize) {
        throw new Error("Não foi possível otimizar esta foto. Tente outra imagem ou reduza o tamanho do arquivo.");
      }
      return file;
    }
    if (webp.size > maxStoredPhotoSize) {
      throw new Error("A imagem continua muito grande após a otimização. Escolha uma foto menor.");
    }
    return new File([webp], `${file.name.replace(/\.[^.]+$/, "")}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

async function uploadPhoto(slot, file) {
  if (!file) return;
  if (photoSaveInProgress) {
    slot.querySelector(".photo-file-input").value = "";
    setPhotoStatus(slot, "Aguarde o envio da outra foto terminar.", "busy");
    return;
  }
  const altInput = slot.querySelector(".photo-alt-input");
  const altText = altInput.value.trim();
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    setPhotoStatus(slot, "Escolha uma imagem JPG, PNG ou WebP.", "error");
    return;
  }
  if (file.size === 0 || file.size > maxPhotoSize) {
    setPhotoStatus(slot, "A imagem original precisa ter no máximo 20 MB.", "error");
    return;
  }
  if (altText.length < 5) {
    setPhotoStatus(slot, "Escreva uma descrição de pelo menos 5 caracteres para a foto.", "error");
    altInput.focus();
    return;
  }
  if (!window.crypto?.randomUUID) {
    setPhotoStatus(slot, "Não foi possível gerar um identificador seguro para a imagem.", "error");
    return;
  }

  const slotName = slot.dataset.photoSlot;
  const folder = slotName === "hero" ? "hero" : "gallery";
  const fileInput = slot.querySelector(".photo-file-input");
  const removeButton = slot.querySelector(".photo-remove-button");
  photoSaveInProgress = true;
  fileInput.disabled = true;
  removeButton.disabled = true;
  setPhotoStatus(slot, "Otimizando e enviando foto…", "busy");

  try {
    const optimizedFile = await optimizePhoto(file);
    const path = `${folder}/${crypto.randomUUID()}.${optimizedFile.type === "image/webp" ? "webp" : optimizedFile.type === "image/png" ? "png" : "jpg"}`;
    const { error: uploadError } = await supabaseClient.storage.from(photoBucket).upload(path, optimizedFile, {
      cacheControl: "31536000",
      upsert: false,
      contentType: optimizedFile.type,
    });
    if (uploadError) throw uploadError;

    try {
      await savePhoto(slot, path, altText);
    } catch (error) {
      const { error: cleanupError } = await supabaseClient.storage.from(photoBucket).remove([path]);
      if (cleanupError) {
        console.error("Falha ao limpar uma foto cujo cadastro não foi salvo:", cleanupError);
        throw new Error("Não foi possível salvar a foto e não foi possível limpar o arquivo enviado. Verifique a conexão e o armazenamento.");
      }
      throw error;
    }
  } catch (error) {
    console.error("Falha ao publicar a foto da hospedagem:", error);
    setPhotoStatus(slot, error.message || "Não foi possível enviar a foto. Verifique o Supabase.", "error");
  } finally {
    fileInput.value = "";
    fileInput.disabled = false;
    removeButton.disabled = false;
    photoSaveInProgress = false;
  }
}

async function showDashboard(session) {
  if (!session) {
    dashboard.hidden = true;
    loginPanel.hidden = false;
    logoutButton.hidden = true;
    reservations = [];
    currentSettings = undefined;
    return;
  }

  try {
    const { data: isAdmin, error } = await supabaseClient.rpc("is_reservations_admin");
    if (error) throw error;
    if (!isAdmin) {
      await supabaseClient.auth.signOut();
      loginMessage.textContent = "Esta conta não tem acesso de administrador.";
      return;
    }

    await loadDashboardData();
    loginPanel.hidden = true;
    dashboard.hidden = false;
    logoutButton.hidden = false;
  } catch (error) {
    console.error("Falha ao carregar o painel administrativo:", error);
    setError(describeConnectionError(error));
    dashboard.hidden = true;
    loginPanel.hidden = false;
    loginMessage.textContent = "Não foi possível carregar o painel. Confira a configuração do Supabase.";
  }
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function initialize() {
  const config = window.CASA_DA_ILHA_CONFIG;
  if (!config || !config.supabaseUrl || !config.supabaseAnonKey
    || config.supabaseUrl.includes("SEU-PROJETO")
    || config.supabaseAnonKey.includes("COLE_A_CHAVE")) {
    connectionNotice.innerHTML =
      "<strong>Painel ainda não conectado.</strong> Siga o arquivo README.md para criar o projeto Supabase e preencher supabase-config.js. Até concluir a configuração, não é possível receber reservas online.";
    loginForm.hidden = true;
    return;
  }

  if (!window.supabase?.createClient) {
    connectionNotice.textContent = "Não foi possível carregar o cliente do Supabase. Verifique a conexão e recarregue a página.";
    loginForm.hidden = true;
    return;
  }

  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginMessage.textContent = "Validando acesso…";
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: document.querySelector("#admin-email").value.trim(),
      password: passwordInput.value,
    });
    if (error) {
      console.error("Falha no login administrativo:", error);
      loginMessage.textContent = "Não foi possível entrar. Confira o e-mail e a senha e tente novamente.";
      return;
    }
    passwordInput.value = "";
    loginMessage.textContent = "";
  });

  recoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newPassword = document.querySelector("#new-admin-password").value;
    if (newPassword.length < 8) {
      recoveryMessage.textContent = "Use uma senha com pelo menos 8 caracteres.";
      return;
    }

    recoveryMessage.textContent = "Atualizando senha…";
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) {
      console.error("Falha ao atualizar senha administrativa:", error);
      recoveryMessage.textContent = "Não foi possível atualizar a senha. Solicite um novo link e tente novamente.";
      return;
    }
    document.querySelector("#new-admin-password").value = "";
    recoveryMessage.textContent = "Senha atualizada.";
    recoveryForm.hidden = true;
    loginForm.hidden = false;
  });

  resetPasswordButton.addEventListener("click", async () => {
    const email = document.querySelector("#admin-email").value.trim();
    if (!email) {
      loginMessage.textContent = "Informe seu e-mail para receber um link de redefinição de senha.";
      document.querySelector("#admin-email").focus();
      return;
    }
    const redirectTo = new URL("admin.html", window.location.href).href;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      console.error("Falha ao solicitar redefinição de senha:", error);
      loginMessage.textContent = "Não foi possível enviar o link. Confira as configurações de e-mail do Supabase.";
      return;
    }
    loginMessage.textContent = "Se este e-mail tiver uma conta, o Supabase enviará um link de redefinição.";
  });

  logoutButton.addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      console.error("Falha ao encerrar sessão administrativa:", error);
      setError("Não foi possível encerrar a sessão. Tente novamente.");
    }
  });

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(settingsForm);
    const whatsapp = String(formData.get("whatsapp") ?? "").trim();
    const rawDigits = whatsapp.replace(/\D/g, "");
    if (whatsapp && (rawDigits.length < 10 || rawDigits.length > 15)) {
      settingsMessage.textContent = "Informe um WhatsApp com DDD e entre 10 e 15 dígitos, ou deixe o campo vazio.";
      return;
    }

    settingsMessage.textContent = "Salvando…";
    const updatedSettings = {
      nightly_rate: Number(formData.get("nightlyRate")),
      cleaning_fee: Number(formData.get("cleaningFee")),
      max_guests: Number(formData.get("maxGuests")),
      whatsapp: rawDigits.length === 10 || rawDigits.length === 11 ? `55${rawDigits}` : rawDigits,
    };
    const { data, error } = await supabaseClient
      .from("site_settings")
      .update(updatedSettings)
      .eq("id", 1)
      .select("nightly_rate, cleaning_fee, max_guests, whatsapp, property_description, public_address, location_description, maps_url, checkin_time, checkout_time, house_rules, payment_policy, cancellation_policy, hero_image_path, hero_image_alt, gallery_image_paths, gallery_image_alts")
      .single();
    if (error) {
      console.error("Falha ao salvar configurações da hospedagem:", error);
      settingsMessage.textContent = "Não foi possível salvar. Verifique a conexão e tente novamente.";
      return;
    }
    currentSettings = data;
    populateSettings(currentSettings);
    settingsMessage.textContent = "Configurações salvas. Os novos pedidos usarão os valores atualizados.";
  });

  contentSettingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!contentSettingsForm.reportValidity()) return;

    const formData = new FormData(contentSettingsForm);
    const mapsUrl = String(formData.get("mapsUrl") ?? "").trim();
    try {
      if (new URL(mapsUrl).protocol !== "https:") throw new Error("invalid_maps_url");
    } catch {
      contentSettingsMessage.textContent = "Informe um link válido de mapa começando com https://.";
      return;
    }

    contentSettingsMessage.textContent = "Salvando…";
    const { data, error } = await supabaseClient
      .from("site_settings")
      .update({
        property_description: String(formData.get("propertyDescription") ?? "").trim(),
        public_address: String(formData.get("publicAddress") ?? "").trim(),
        location_description: String(formData.get("locationDescription") ?? "").trim(),
        maps_url: mapsUrl,
        checkin_time: String(formData.get("checkinTime") ?? ""),
        checkout_time: String(formData.get("checkoutTime") ?? ""),
        house_rules: String(formData.get("houseRules") ?? "").trim(),
        payment_policy: String(formData.get("paymentPolicy") ?? "").trim(),
        cancellation_policy: String(formData.get("cancellationPolicy") ?? "").trim(),
      })
      .eq("id", 1)
      .select("nightly_rate, cleaning_fee, max_guests, whatsapp, property_description, public_address, location_description, maps_url, checkin_time, checkout_time, house_rules, payment_policy, cancellation_policy, hero_image_path, hero_image_alt, gallery_image_paths, gallery_image_alts")
      .single();
    if (error) {
      console.error("Falha ao salvar descrição e localização da hospedagem:", error);
      contentSettingsMessage.textContent = "Não foi possível salvar. Verifique a conexão e tente novamente.";
      return;
    }

    currentSettings = data;
    populateSettings(currentSettings);
    contentSettingsMessage.textContent = "Informações da hospedagem salvas e publicadas no site.";
  });

  photosPanel.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.matches(".photo-file-input")) return;
    const slot = event.target.closest("[data-photo-slot]");
    if (slot) void uploadPhoto(slot, event.target.files?.[0]);
  });

  photosPanel.addEventListener("click", async (event) => {
    if (!(event.target instanceof HTMLButtonElement) || !event.target.matches(".photo-remove-button")) return;
    const slot = event.target.closest("[data-photo-slot]");
    if (!slot || !window.confirm("Remover esta foto do site?")) return;
    if (photoSaveInProgress) {
      setPhotoStatus(slot, "Aguarde o envio da outra foto terminar.", "busy");
      return;
    }

    photoSaveInProgress = true;
    event.target.disabled = true;
    setPhotoStatus(slot, "Removendo foto…", "busy");
    try {
      await savePhoto(slot, "", "");
    } catch (error) {
      console.error("Falha ao remover a foto da hospedagem:", error);
      setPhotoStatus(slot, "Não foi possível remover a foto. Verifique a conexão e tente novamente.", "error");
    } finally {
      event.target.disabled = false;
      photoSaveInProgress = false;
    }
  });

  searchInput.addEventListener("input", render);
  statusFilter.addEventListener("change", render);

  exportButton.addEventListener("click", () => {
    if (reservations.length === 0) {
      setError("Ainda não há reservas para exportar.");
      return;
    }
    const headers = ["Hóspede", "E-mail", "WhatsApp", "Check-in", "Check-out", "Hóspedes", "Noites", "Estimativa", "Status"];
    const rows = reservations.map((reservation) => [
      reservation.guest_name, reservation.guest_email, reservation.guest_phone, reservation.checkin,
      reservation.checkout, reservation.guests, reservation.nights, reservation.total,
      statusLabels[reservation.status] ?? reservation.status,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = url;
    download.download = "reservas-chale-azul.csv";
    download.click();
    URL.revokeObjectURL(url);
  });

  reservationsList.addEventListener("change", async (event) => {
    if (!(event.target instanceof HTMLSelectElement) || !event.target.matches(".status-select")) return;
    const card = event.target.closest("[data-id]");
    const reservation = reservations.find((item) => item.id === card?.dataset.id);
    if (!reservation || !validStatuses.includes(event.target.value)) return;

    const previousStatus = reservation.status;
    const newStatus = event.target.value;
    event.target.disabled = true;
    const { error } = await supabaseClient.rpc("update_reservation_status", {
      p_reservation_id: reservation.id,
      p_status: newStatus,
    });
    if (error) {
      console.error("Falha ao atualizar status da reserva:", error);
      setError(error.code === "23P01" || error.message?.includes("stay_dates_unavailable")
        ? "Não é possível aceitar o pedido: as datas já estão ocupadas por outra solicitação ou reserva."
        : "Não foi possível atualizar o status. A reserva pode ter sido alterada em outra sessão.");
      event.target.value = previousStatus;
      event.target.disabled = false;
      return;
    }
    reservation.status = newStatus;
    render();
  });

  reservationsList.addEventListener("click", async (event) => {
    if (!(event.target instanceof HTMLButtonElement) || !event.target.matches(".delete-button")) return;
    const card = event.target.closest("[data-id]");
    const reservation = reservations.find((item) => item.id === card?.dataset.id);
    if (!reservation || !window.confirm(`Excluir o pedido de ${reservation.guest_name}? Essa ação não pode ser desfeita.`)) return;

    const { error } = await supabaseClient.from("reservations").delete().eq("id", reservation.id);
    if (error) {
      console.error("Falha ao excluir pedido de reserva:", error);
      setError("Não foi possível excluir o pedido. Confira sua conexão e tente novamente.");
      return;
    }
    reservations = reservations.filter((item) => item.id !== reservation.id);
    render();
  });

  supabaseClient.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => {
      if (event === "PASSWORD_RECOVERY") {
        loginPanel.hidden = false;
        dashboard.hidden = true;
        loginForm.hidden = true;
        recoveryForm.hidden = false;
        loginMessage.textContent = "";
        recoveryMessage.textContent = "";
        return;
      }
      if (event === "SIGNED_OUT") {
        loginForm.hidden = false;
        recoveryForm.hidden = true;
        loginMessage.textContent = "";
      }
      void showDashboard(session);
    }, 0);
  });
  void supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.error("Falha ao verificar a sessão administrativa:", error);
      loginMessage.textContent = "Não foi possível verificar sua sessão. Recarregue a página e tente novamente.";
      return;
    }
    void showDashboard(data.session);
  });
}

initialize();
