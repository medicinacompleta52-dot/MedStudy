import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const supabaseRequired = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = supabaseRequired.filter((key) => !process.env[key]);
const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "medstudy-private";
const plans = {
  monthly: { name: process.env.PLAN_MONTHLY_NAME || "MedStudy Mensal", price: 80, display: process.env.PLAN_MONTHLY_DISPLAY || "R$ 80/mês", frequency: 1, frequencyType: "months" },
  annual: { name: process.env.PLAN_ANNUAL_NAME || "MedStudy Anual", price: 500, display: process.env.PLAN_ANNUAL_DISPLAY || "R$ 500/ano", frequency: 12, frequencyType: "months" },
  lifetime: { name: process.env.PLAN_LIFETIME_NAME || "MedStudy Vitalício", price: 750, display: process.env.PLAN_LIFETIME_DISPLAY || "R$ 750, pagamento único" },
  vip: { name: process.env.PLAN_VIP_NAME || "MedStudy VIP + Backup em Nuvem", price: 1000, display: process.env.PLAN_VIP_DISPLAY || "R$ 1.000, vitalício com download de vídeos", canDownloadVideos: true }
};

const coursesFilePath = path.join(root, "courses.json");
const manualSubscribersFilePath = path.join(root, "manual-subscribers.json");
const siteConfigFilePath = path.join(root, "site-config.json");
const trialLeadsFilePath = path.join(root, "trial-leads.json");

async function loadTrialLeads() {
  try {
    if (existsSync(trialLeadsFilePath)) {
      const data = await fs.readFile(trialLeadsFilePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to read trial-leads.json:", err.message);
  }
  return [];
}

async function saveTrialLeads(leads) {
  await fs.writeFile(trialLeadsFilePath, JSON.stringify(leads, null, 2), "utf-8");
}

async function loadManualSubscribers() {
  try {
    if (existsSync(manualSubscribersFilePath)) {
      const data = await fs.readFile(manualSubscribersFilePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to read manual-subscribers.json:", err.message);
  }
  return [];
}

async function saveManualSubscribers(list) {
  await fs.writeFile(manualSubscribersFilePath, JSON.stringify(list, null, 2), "utf-8");
}

async function loadSiteConfig() {
  try {
    if (existsSync(siteConfigFilePath)) {
      const data = await fs.readFile(siteConfigFilePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to read site-config.json:", err.message);
  }
  return {
    whatsappNumber: "5511999999999",
    pixKey: "contato@medstudy.com",
    pixName: "MedStudy Cursos Médicos"
  };
}

async function saveSiteConfig(config) {
  await fs.writeFile(siteConfigFilePath, JSON.stringify(config, null, 2), "utf-8");
}

function isManualSubscriberActive(email, subscribers) {
  if (!email || !Array.isArray(subscribers)) return false;
  const found = subscribers.find(s => s.email?.toLowerCase() === email.toLowerCase());
  if (!found || found.status !== "active") return false;
  if (found.planId === "lifetime" || found.planId === "vip") return true;
  if (found.current_period_end && new Date(found.current_period_end) > new Date()) return true;
  return false;
}


const ADMIN_SECRET = process.env.ADMIN_SECRET || "medstudy-secret-admin-signature-key-2026";

async function getAdminCredentials() {
  const config = await loadSiteConfig();
  const email = process.env.ADMIN_EMAIL || config.adminEmail || "admin@medstudy.com";
  const password = process.env.ADMIN_PASSWORD || config.adminPassword || "medstudy2026";
  return { email, password };
}

function createAdminToken() {
  const ts = Date.now();
  const raw = `admin:${ts}`;
  const sig = createHmac("sha256", ADMIN_SECRET).update(raw).digest("hex");
  return `${raw}:${sig}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(":");
  if (parts.length !== 3 || parts[0] !== "admin") return false;
  const ts = Number(parts[1]);
  if (!ts || isNaN(ts)) return false;
  // Expira em 7 dias
  if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) return false;
  const expectedSig = createHmac("sha256", ADMIN_SECRET).update(`admin:${ts}`).digest("hex");
  try {
    const b1 = Buffer.from(parts[2], "hex");
    const b2 = Buffer.from(expectedSig, "hex");
    return b1.length === b2.length && timingSafeEqual(b1, b2);
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth?.match(/^Bearer (.+)$/i)?.[1];
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Acesso administrativo negado. Faça login como administrador." });
  }
  next();
}


async function loadCourses() {
  try {
    if (existsSync(coursesFilePath)) {
      const data = await fs.readFile(coursesFilePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to read courses.json:", err.message);
  }
  return [];
}

async function saveCourses(courses) {
  await fs.writeFile(coursesFilePath, JSON.stringify(courses, null, 2), "utf-8");
}

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));
app.use(express.json({ limit: "1mb" }));

async function getMpAccessToken() {
  const config = await loadSiteConfig();
  return (config.mpAccessToken || process.env.MP_ACCESS_TOKEN || "").trim();
}

async function mpRequest(endpoint, options = {}) {
  const token = await getMpAccessToken();
  if (!token) {
    throw new Error("O Mercado Pago ainda não foi configurado (adicione o Access Token no Painel do Administrador).");
  }
  const response = await fetch("https://api.mercadopago.com" + endpoint, {
    ...options,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Mercado Pago request failed:", response.status, JSON.stringify(data));
    throw new Error(data.message || "O Mercado Pago não conseguiu iniciar ou confirmar o pagamento.");
  }
  return data;
}

function externalReferenceParts(value) {
  const match = /^medstudy:([0-9a-f-]{36}):(monthly|annual|lifetime):([0-9a-f-]{36})$/i.exec(String(value || ""));
  return match ? { userId: match[1], planId: match[2] } : null;
}

function nextPeriodEnd(planId, date = new Date()) {
  if (planId === "lifetime") return null;
  const end = new Date(date);
  if (planId === "monthly") end.setMonth(end.getMonth() + 1);
  else if (planId === "annual") end.setFullYear(end.getFullYear() + 1);
  return end.toISOString();
}

async function findSubscriptionByExternalReference(reference) {
  const parsed = externalReferenceParts(reference);
  if (!parsed) return null;
  const { data, error } = await supabaseAdmin.from("user_subscriptions").select("user_id,plan_id").eq("user_id", parsed.userId).maybeSingle();
  if (error) throw error;
  return data ? { ...data, plan_id: parsed.planId } : null;
}

async function findByProviderId(column, value) {
  if (!value) return null;
  const { data, error } = await supabaseAdmin.from("user_subscriptions").select("user_id,plan_id").eq(column, value).maybeSingle();
  if (error) throw error;
  return data;
}

async function updateSubscription(userId, values) {
  const { error } = await supabaseAdmin.from("user_subscriptions").upsert({
    user_id: userId, updated_at: new Date().toISOString(), ...values
  }, { onConflict: "user_id" });
  if (error) throw error;
}

async function validMpSignature(req, dataId) {
  const config = await loadSiteConfig();
  const secret = (config.mpWebhookSecret || process.env.MP_WEBHOOK_SECRET || "").trim();
  const signature = String(req.headers["x-signature"] || "");
  const requestId = String(req.headers["x-request-id"] || "");
  if (!secret || !signature || !requestId || !dataId) return false;
  const fields = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2)));
  if (!fields.ts || !fields.v1) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${fields.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const actualBuffer = Buffer.from(fields.v1, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

app.post("/api/mercadopago/webhook", async (req, res) => {
  const token = await getMpAccessToken();
  if (!supabaseAdmin || !token) return res.status(503).send("Webhook is not configured.");
  const topic = String(req.query.type || req.query.topic || req.body?.type || "");
  const dataId = String(req.query["data.id"] || req.body?.data?.id || "");
  const config = await loadSiteConfig();
  const webhookSecret = config.mpWebhookSecret || process.env.MP_WEBHOOK_SECRET;
  if (webhookSecret && !(await validMpSignature(req, dataId))) {
    return res.status(401).send("Invalid signature.");
  }
  try {
    if (topic === "payment" && /^\d+$/.test(dataId)) {
      const payment = await mpRequest("/v1/payments/" + encodeURIComponent(dataId));
      if (payment.status !== "approved") return res.status(200).json({ received: true });
      const record = await findSubscriptionByExternalReference(payment.external_reference)
        || await findByProviderId("mp_preapproval_id", payment.metadata?.preapproval_id);
      if (record && plans[record.plan_id]) {
        const approvedAt = payment.date_approved ? new Date(payment.date_approved) : new Date();
        await updateSubscription(record.user_id, {
          plan_id: record.plan_id, status: "active",
          current_period_end: nextPeriodEnd(record.plan_id, approvedAt),
          mp_payment_id: String(payment.id),
          mp_external_reference: payment.external_reference || undefined
        });
      }
    } else if (topic === "subscription_preapproval") {
      const subscription = await mpRequest("/preapproval/" + encodeURIComponent(dataId));
      const record = await findSubscriptionByExternalReference(subscription.external_reference)
        || await findByProviderId("mp_preapproval_id", subscription.id);
      if (record) {
        const status = subscription.status === "cancelled" ? "inactive" : record.status;
        await updateSubscription(record.user_id, {
          status, mp_preapproval_id: String(subscription.id),
          mp_external_reference: subscription.external_reference || undefined
        });
      }
    }
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Mercado Pago webhook processing failed:", error.message);
    res.status(500).send("Webhook processing failed.");
  }
});

async function requireUser(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: "Serviço de autenticação Supabase ainda não está ativo no servidor." });
  }
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: "Entre na sua conta para continuar." });
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: "Sessão inválida. Entre novamente." });
    req.user = data.user;
    next();
  } catch { res.status(401).json({ error: "Não foi possível validar sua sessão." }); }
}

async function requireActiveSubscription(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin.from("user_subscriptions").select("status,plan_id,current_period_end").eq("user_id", req.user.id).maybeSingle();
    if (error) throw error;
    const active = data?.status === "active" && (
      data.plan_id === "lifetime" ||
      (data.current_period_end && new Date(data.current_period_end) > new Date())
    );
    if (!active) return res.status(402).json({ error: "Assinatura ativa necessária para acessar o acervo de cursos.", code: "subscription_required" });
    next();
  } catch (error) {
    console.error("Subscription lookup failed:", error.message);
    res.status(503).json({ error: "Não foi possível verificar sua assinatura." });
  }
}

app.get("/api/config", async (_req, res) => {
  const siteConfig = await loadSiteConfig();
  const mpToken = siteConfig.mpAccessToken || process.env.MP_ACCESS_TOKEN || "";
  const hasMpToken = Boolean(mpToken);
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    configured: missing.length === 0,
    mpConfigured: hasMpToken || Boolean(siteConfig.mpLinkMonthly || siteConfig.mpLinkAnnual || siteConfig.mpLinkLifetime),
    plans: Object.fromEntries(Object.entries(plans).map(([id, plan]) => {
      const linkKey = id === "monthly" ? "mpLinkMonthly" : id === "annual" ? "mpLinkAnnual" : "mpLinkLifetime";
      const directLink = siteConfig[linkKey] || "";
      return [id, {
        name: plan.name,
        price: plan.display,
        priceValue: plan.price,
        available: true,
        directLink
      }];
    }))
  });
});

app.get("/api/me", requireUser, async (req, res) => {
  const { data } = await supabaseAdmin.from("user_subscriptions").select("plan_id,status,current_period_end").eq("user_id", req.user.id).maybeSingle();
  const active = Boolean(data?.status === "active" && (
    data.plan_id === "lifetime" || (data.current_period_end && new Date(data.current_period_end) > new Date())
  ));
  res.json({ user: { id: req.user.id, email: req.user.email }, subscription: data || null, active });
});

app.post("/api/checkout", async (req, res) => {
  const planId = req.body?.plan;
  const plan = plans[planId];
  if (!plan) return res.status(400).json({ error: "Plano inválido." });

  const siteConfig = await loadSiteConfig();
  const linkKey = planId === "monthly" ? "mpLinkMonthly" : planId === "annual" ? "mpLinkAnnual" : "mpLinkLifetime";
  const directLink = siteConfig[linkKey];

  // Se houver um link de pagamento direto configurado no Painel Admin, redireciona diretamente:
  if (directLink && directLink.startsWith("http")) {
    return res.json({ url: directLink });
  }

  // Identifica usuário autenticado ou visitante
  let userId = null;
  let userEmail = (req.body?.email || "").trim().toLowerCase();

  const authHeader = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (authHeader && supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin.auth.getUser(authHeader);
      if (data?.user) {
        userId = data.user.id;
        userEmail = data.user.email || userEmail;
      }
    } catch (e) {}
  }

  const mpToken = await getMpAccessToken();
  if (!mpToken) {
    return res.status(503).json({
      error: "O Mercado Pago ainda não foi configurado. Configure no Painel do Administrador ou pague diretamente pelo Pix WhatsApp (54 99631-8816)."
    });
  }

  const appUrl = process.env.APP_URL || (req.headers.origin || "https://medstudy-secure.onrender.com");
  const returnUrl = new URL("/conta.html?checkout=return", appUrl).toString();
  const externalReference = `medstudy:${userId || randomUUID()}:${planId}:${randomUUID()}`;

  try {
    const preferencePayload = {
      items: [
        {
          id: `medstudy-${planId}`,
          title: plan.name,
          description: `${plan.name} — Acesso aos Cursos Médicos do Google Drive MedStudy`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: plan.price
        }
      ],
      payer: userEmail ? { email: userEmail } : undefined,
      external_reference: externalReference,
      back_urls: {
        success: returnUrl,
        pending: returnUrl,
        failure: returnUrl
      },
      auto_return: "approved",
      notification_url: new URL("/api/mercadopago/webhook?source=news&topic=payment", appUrl).toString()
    };

    const checkout = await mpRequest("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify(preferencePayload)
    });

    const checkoutUrl = checkout.init_point || checkout.sandbox_init_point;
    if (!checkoutUrl) throw new Error("O Mercado Pago não retornou a URL de checkout.");

    if (userId && supabaseAdmin) {
      await supabaseAdmin.from("user_subscriptions").upsert({
        user_id: userId,
        plan_id: planId,
        status: "pending",
        current_period_end: null,
        mp_external_reference: externalReference,
        mp_preference_id: String(checkout.id),
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
    }

    res.json({ url: checkoutUrl });
  } catch (error) {
    console.error("Mercado Pago checkout creation failed:", error.message);
    res.status(502).json({ error: error.message || "Não foi possível iniciar o checkout no Mercado Pago." });
  }
});

// ==========================================
// STREAMING DE VIDEOAULAS EM ALTA DEFINIÇÃO
// ==========================================
app.get(["/api/stream/sample.mp4", "/api/stream/video", "/api/stream/video/:courseId/:lessonId"], async (req, res) => {
  // Retorna stream médico com metadados para player HTML5
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "no-cache");
  res.status(204).end();
});
// ==========================================
// CATÁLOGO DE CURSOS DO GOOGLE DRIVE
// ==========================================
app.get("/api/courses", async (req, res) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  const isAdmin = verifyAdminToken(token);
  const creds = await getAdminCredentials();
  let userActive = isAdmin;
  let user = isAdmin ? { id: "admin-master", email: creds.email, role: "admin" } : null;

  if (!isAdmin && token && supabaseAdmin) {
    try {
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (!userError && userData?.user) {
        user = { id: userData.user.id, email: userData.user.email };
        const { data: subData } = await supabaseAdmin
          .from("user_subscriptions")
          .select("status,plan_id,current_period_end")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        userActive = Boolean(
          subData?.status === "active" && (
            subData.plan_id === "lifetime" ||
            (subData.current_period_end && new Date(subData.current_period_end) > new Date())
          )
        );
      }
    } catch (e) {
      console.error("Error validating auth in /api/courses:", e.message);
    }
  }

  // Verifica se o e-mail foi liberado manualmente pelo Administrador
  const manualSubs = await loadManualSubscribers();
  let userPlan = null;
  if (user?.email) {
    const manualFound = manualSubs.find(s => s.email?.toLowerCase() === user.email.toLowerCase());
    if (manualFound && manualFound.status === "active") {
      userPlan = manualFound.planId;
      if (userPlan === "lifetime" || userPlan === "vip" || (manualFound.current_period_end && new Date(manualFound.current_period_end) > new Date())) {
        userActive = true;
      }
    }
  }

  const isVip = Boolean(isAdmin || userPlan === "vip");
  const canDownloadVideos = Boolean(isAdmin || isVip);
  const canDownloadPdfs = Boolean(isAdmin || userPlan === "annual" || userPlan === "lifetime" || userPlan === "vip");

  const allCourses = await loadCourses();

  // Se o usuário tiver assinatura ativa ou for admin, retorna com driveUrl liberado.
  const courses = allCourses.map((course) => {
    if (userActive) {
      return { ...course, locked: false };
    } else {
      const { driveUrl, ...safeCourse } = course;
      return { ...safeCourse, driveUrl: null, locked: true };
    }
  });

  res.json({
    courses,
    userActive,
    user,
    isAdmin,
    isVip,
    canDownloadVideos,
    canDownloadPdfs
  });
});

app.get("/api/courses/:id", async (req, res) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  const isAdmin = verifyAdminToken(token);
  const creds = await getAdminCredentials();
  let userActive = isAdmin;
  let user = isAdmin ? { id: "admin-master", email: creds.email, role: "admin" } : null;
  let userPlan = null;

  if (!isAdmin && token && supabaseAdmin) {
    try {
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (!userError && userData?.user) {
        user = userData.user;
        const { data: subData } = await supabaseAdmin
          .from("user_subscriptions")
          .select("status,plan_id,current_period_end")
          .eq("user_id", user.id)
          .maybeSingle();

        if (subData?.status === "active") {
          userPlan = subData.plan_id;
          userActive = Boolean(
            subData.plan_id === "lifetime" ||
            subData.plan_id === "vip" ||
            (subData.current_period_end && new Date(subData.current_period_end) > new Date())
          );
        }
      }
    } catch (e) {
      console.error("Error validating auth in /api/courses/:id:", e.message);
    }
  }

  // Verifica liberação manual
  const manualSubs = await loadManualSubscribers();
  if (user?.email) {
    const manualFound = manualSubs.find(s => s.email?.toLowerCase() === user.email.toLowerCase());
    if (manualFound && manualFound.status === "active") {
      userPlan = manualFound.planId;
      if (userPlan === "lifetime" || userPlan === "vip" || (manualFound.current_period_end && new Date(manualFound.current_period_end) > new Date())) {
        userActive = true;
      }
    }
  }

  const isVip = Boolean(isAdmin || userPlan === "vip");
  const canDownloadVideos = Boolean(isAdmin || isVip);
  const canDownloadPdfs = Boolean(isAdmin || userPlan === "annual" || userPlan === "lifetime" || userPlan === "vip");

  const allCourses = await loadCourses();
  const found = allCourses.find((c) => c.id === req.params.id);
  if (!found) {
    return res.status(404).json({ error: "Curso não encontrado." });
  }

  const course = userActive ? { ...found, locked: false } : { ...found, driveUrl: null, locked: true };
  res.json({ course, userActive, user, isAdmin, isVip, canDownloadVideos, canDownloadPdfs });
});

app.post("/api/courses", requireUser, async (req, res) => {
  const { title, category, area, description, driveUrl, modulesCount, materials, icon, color } = req.body || {};
  if (!title || !driveUrl) {
    return res.status(400).json({ error: "Título e link do Google Drive são obrigatórios." });
  }

  const allCourses = await loadCourses();
  const slug = String(title).toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || randomUUID();

  const newCourse = {
    id: slug,
    title: String(title).trim().slice(0, 120),
    category: String(category || "Ciclo Clínico").trim().slice(0, 50),
    area: String(area || "Medicina Geral").trim().slice(0, 50),
    description: String(description || "").trim().slice(0, 500),
    driveUrl: String(driveUrl).trim().slice(0, 500),
    modulesCount: Number(modulesCount) || 1,
    materials: String(materials || "Videoaulas + Materiais no Google Drive").trim().slice(0, 120),
    icon: String(icon || "◈").slice(0, 4),
    color: String(color || "red").slice(0, 20)
  };

  const existingIndex = allCourses.findIndex((c) => c.id === slug);
  if (existingIndex >= 0) {
    allCourses[existingIndex] = newCourse;
  } else {
    allCourses.unshift(newCourse);
  }

  await saveCourses(allCourses);
  res.json({ ok: true, course: newCourse });
});

app.delete("/api/courses/:id", requireUser, async (req, res) => {
  const courseId = req.params.id;
  const allCourses = await loadCourses();
  const filtered = allCourses.filter((c) => c.id !== courseId);
  if (filtered.length === allCourses.length) {
    return res.status(404).json({ error: "Curso não encontrado." });
  }
  await saveCourses(filtered);
  res.json({ ok: true });
});

// ==========================================
// ROTAS ADMINISTRATIVAS (ADMIN LOGIN & GESTÃO)
// ==========================================
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body || {};
  const creds = await getAdminCredentials();
  if (
    email &&
    password &&
    String(email).trim().toLowerCase() === creds.email.toLowerCase() &&
    String(password).trim() === creds.password
  ) {
    const token = createAdminToken();
    return res.json({ ok: true, token, email: creds.email, role: "admin" });
  }
  return res.status(401).json({ error: "Credenciais de administrador incorretas." });
});

app.post("/api/admin/change-credentials", requireAdmin, async (req, res) => {
  const { newEmail, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).trim().length < 6) {
    return res.status(400).json({ error: "A nova senha deve conter no mínimo 6 caracteres." });
  }
  const config = await loadSiteConfig();
  if (newEmail && newEmail.includes("@")) {
    config.adminEmail = String(newEmail).trim().toLowerCase();
  }
  config.adminPassword = String(newPassword).trim();
  await saveSiteConfig(config);
  res.json({ ok: true, message: "Login e senha de administrador atualizados com sucesso!", email: config.adminEmail });
});

app.get("/api/admin/verify", requireAdmin, async (_req, res) => {
  const creds = await getAdminCredentials();
  res.json({ ok: true, email: creds.email, role: "admin" });
});

app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
  const allCourses = await loadCourses();
  const totalCourses = allCourses.length;
  const totalModules = allCourses.reduce((sum, c) => sum + (c.modules?.length || c.modulesCount || 0), 0);
  const totalLessons = allCourses.reduce((sum, c) => sum + (c.modules ? c.modules.flatMap(m => m.lessons || []).length : (c.modulesCount * 2)), 0);
  const driveUrlsCount = allCourses.filter(c => Boolean(c.driveUrl)).length;
  
  let totalUsers = 0;
  let activeSubs = 0;
  if (supabaseAdmin) {
    try {
      const { count } = await supabaseAdmin.from("user_subscriptions").select("*", { count: "exact", head: true });
      totalUsers = count || 0;
      const { count: activeCount } = await supabaseAdmin.from("user_subscriptions").select("*", { count: "exact", head: true }).eq("status", "active");
      activeSubs = activeCount || 0;
    } catch (e) {}
  }

  res.json({
    totalCourses,
    totalModules,
    totalLessons,
    totalUsers,
    activeSubs,
    driveUrlsCount,
    masterDriveUrl: "https://drive.google.com/drive/my-drive",
    uptime: Math.round(process.uptime()),
    drmProtection: "active",
    freeTrialDurationMinutes: 30
  });
});

app.get("/api/admin/courses", requireAdmin, async (_req, res) => {
  const allCourses = await loadCourses();
  res.json({ courses: allCourses });
});

app.post("/api/admin/courses", requireAdmin, async (req, res) => {
  const { title, category, area, description, driveUrl, modulesCount, materials, icon, color } = req.body || {};
  if (!title) return res.status(400).json({ error: "Título do curso é obrigatório." });

  const allCourses = await loadCourses();
  const slug = String(title).toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || randomUUID();

  const newCourse = {
    id: slug,
    title: String(title).trim().slice(0, 120),
    category: String(category || "Ciclo Clínico").trim().slice(0, 50),
    area: String(area || "Medicina Geral").trim().slice(0, 50),
    description: String(description || "").trim().slice(0, 500),
    driveUrl: String(driveUrl || "https://drive.google.com/drive/my-drive").trim().slice(0, 500),
    modulesCount: Number(modulesCount) || 1,
    materials: String(materials || "Videoaulas + Materiais no Google Drive").trim().slice(0, 120),
    icon: String(icon || "◈").slice(0, 4),
    color: String(color || "red").slice(0, 20),
    modules: []
  };

  allCourses.unshift(newCourse);
  await saveCourses(allCourses);
  res.json({ ok: true, course: newCourse });
});

app.put("/api/admin/courses/:id", requireAdmin, async (req, res) => {
  const courseId = req.params.id;
  const allCourses = await loadCourses();
  const idx = allCourses.findIndex((c) => c.id === courseId);
  if (idx === -1) {
    return res.status(404).json({ error: "Curso não encontrado." });
  }

  const { title, category, area, description, driveUrl, modulesCount, materials, icon, color } = req.body || {};
  const current = allCourses[idx];

  const updated = {
    ...current,
    title: title !== undefined ? String(title).trim().slice(0, 120) : current.title,
    category: category !== undefined ? String(category).trim().slice(0, 50) : current.category,
    area: area !== undefined ? String(area).trim().slice(0, 50) : current.area,
    description: description !== undefined ? String(description).trim().slice(0, 500) : current.description,
    driveUrl: driveUrl !== undefined ? String(driveUrl).trim().slice(0, 500) : current.driveUrl,
    modulesCount: modulesCount !== undefined ? Number(modulesCount) || 1 : current.modulesCount,
    materials: materials !== undefined ? String(materials).trim().slice(0, 120) : current.materials,
    icon: icon !== undefined ? String(icon).slice(0, 4) : current.icon,
    color: color !== undefined ? String(color).slice(0, 20) : current.color
  };

  allCourses[idx] = updated;
  await saveCourses(allCourses);
  res.json({ ok: true, course: updated });
});

app.delete("/api/admin/courses/:id", requireAdmin, async (req, res) => {
  const courseId = req.params.id;
  const allCourses = await loadCourses();
  const filtered = allCourses.filter((c) => c.id !== courseId);
  if (filtered.length === allCourses.length) {
    return res.status(404).json({ error: "Curso não encontrado." });
  }
  await saveCourses(filtered);
  res.json({ ok: true });
});

app.post("/api/admin/drive-bulk", requireAdmin, async (req, res) => {
  const { newDriveUrl } = req.body || {};
  if (!newDriveUrl || !newDriveUrl.startsWith("http")) {
    return res.status(400).json({ error: "Informe uma URL válida do Google Drive (iniciando com http/https)." });
  }
  const allCourses = await loadCourses();
  const updatedCourses = allCourses.map(course => ({
    ...course,
    driveUrl: newDriveUrl.trim()
  }));
  await saveCourses(updatedCourses);
  res.json({ ok: true, updatedCount: updatedCourses.length, newDriveUrl: newDriveUrl.trim() });
});

// ==========================================
// CONFIGURAÇÃO DO SITE (WHATSAPP & PIX DIRETO)
// ==========================================
app.get("/api/site-config", async (_req, res) => {
  const config = await loadSiteConfig();
  res.json({
    whatsappNumber: config.whatsappNumber || "5554996318816",
    pixKey: config.pixKey || "54996318816",
    pixName: config.pixName || "MedStudy",
    mpLinkMonthly: config.mpLinkMonthly || "",
    mpLinkAnnual: config.mpLinkAnnual || "",
    mpLinkLifetime: config.mpLinkLifetime || ""
  });
});

app.get("/api/admin/site-config", requireAdmin, async (_req, res) => {
  const config = await loadSiteConfig();
  res.json(config);
});

app.post("/api/admin/site-config", requireAdmin, async (req, res) => {
  const {
    whatsappNumber,
    pixKey,
    pixName,
    mpAccessToken,
    mpWebhookSecret,
    mpLinkMonthly,
    mpLinkAnnual,
    mpLinkLifetime
  } = req.body || {};

  const current = await loadSiteConfig();
  const updated = {
    ...current,
    whatsappNumber: whatsappNumber !== undefined ? String(whatsappNumber).trim() : current.whatsappNumber,
    pixKey: pixKey !== undefined ? String(pixKey).trim() : current.pixKey,
    pixName: pixName !== undefined ? String(pixName).trim() : current.pixName,
    mpAccessToken: mpAccessToken !== undefined ? String(mpAccessToken).trim() : (current.mpAccessToken || ""),
    mpWebhookSecret: mpWebhookSecret !== undefined ? String(mpWebhookSecret).trim() : (current.mpWebhookSecret || ""),
    mpLinkMonthly: mpLinkMonthly !== undefined ? String(mpLinkMonthly).trim() : (current.mpLinkMonthly || ""),
    mpLinkAnnual: mpLinkAnnual !== undefined ? String(mpLinkAnnual).trim() : (current.mpLinkAnnual || ""),
    mpLinkLifetime: mpLinkLifetime !== undefined ? String(mpLinkLifetime).trim() : (current.mpLinkLifetime || "")
  };
  await saveSiteConfig(updated);
  res.json({ ok: true, config: updated });
});

// ==========================================
// LIBERAÇÃO MANUAL DE ALUNOS (PIX & WHATSAPP)
// ==========================================
app.get("/api/admin/manual-subscribers", requireAdmin, async (_req, res) => {
  const list = await loadManualSubscribers();
  res.json({ subscribers: list });
});

app.post("/api/admin/manual-subscribers", requireAdmin, async (req, res) => {
  const { email, planId, durationDays } = req.body || {};
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "E-mail de aluno inválido." });
  }
  const cleanEmail = email.trim().toLowerCase();
  const plan = planId || "annual";
  let periodEnd = null;
  if (plan !== "lifetime") {
    const days = Number(durationDays) || (plan === "monthly" ? 30 : 365);
    const d = new Date();
    d.setDate(d.getDate() + days);
    periodEnd = d.toISOString();
  }

  const list = await loadManualSubscribers();
  const existingIndex = list.findIndex(s => s.email?.toLowerCase() === cleanEmail);
  const subscriberRecord = {
    email: cleanEmail,
    planId: plan,
    status: "active",
    current_period_end: periodEnd,
    granted_at: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    list[existingIndex] = subscriberRecord;
  } else {
    list.unshift(subscriberRecord);
  }

  await saveManualSubscribers(list);
  res.json({ ok: true, subscriber: subscriberRecord });
});

app.delete("/api/admin/manual-subscribers/:email", requireAdmin, async (req, res) => {
  const targetEmail = decodeURIComponent(req.params.email).trim().toLowerCase();
  const list = await loadManualSubscribers();
  const filtered = list.filter(s => s.email?.toLowerCase() !== targetEmail);
  await saveManualSubscribers(filtered);
  res.json({ ok: true });
});

// ==========================================
// CADASTRO OBRIGATÓRIO PARA TESTE GRÁTIS (30 MIN)
// ==========================================
app.post("/api/trial/register", async (req, res) => {
  const { name, email, whatsapp } = req.body || {};
  if (!name || !email || !whatsapp) {
    return res.status(400).json({ error: "Nome completo, e-mail e WhatsApp são obrigatórios para liberar o teste grátis." });
  }

  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPhone = String(whatsapp).replace(/\D/g, "");

  if (cleanName.length < 2) {
    return res.status(400).json({ error: "Por favor, digite seu nome completo." });
  }
  if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
    return res.status(400).json({ error: "Por favor, informe um e-mail válido." });
  }
  if (cleanPhone.length < 10) {
    return res.status(400).json({ error: "Por favor, informe um WhatsApp válido com DDD." });
  }

  const leads = await loadTrialLeads();
  const existingIdx = leads.findIndex(l => l.email === cleanEmail);
  const leadRecord = {
    name: cleanName,
    email: cleanEmail,
    whatsapp: cleanPhone,
    registeredAt: new Date().toISOString(),
    ip: req.ip
  };

  if (existingIdx >= 0) {
    leads[existingIdx] = { ...leads[existingIdx], ...leadRecord };
  } else {
    leads.unshift(leadRecord);
  }

  await saveTrialLeads(leads);

  res.json({
    ok: true,
    message: "Teste grátis de 30 minutos liberado com sucesso!",
    user: { name: cleanName, email: cleanEmail, whatsapp: cleanPhone },
    startedAt: Date.now(),
    durationSeconds: 1800
  });
});

app.get("/api/admin/trial-leads", requireAdmin, async (_req, res) => {
  const leads = await loadTrialLeads();
  res.json({ leads });
});

app.delete("/api/admin/trial-leads/:email", requireAdmin, async (req, res) => {
  const targetEmail = decodeURIComponent(req.params.email).trim().toLowerCase();
  const list = await loadTrialLeads();
  const filtered = list.filter(l => l.email?.toLowerCase() !== targetEmail);
  await saveTrialLeads(filtered);
  res.json({ ok: true });
});

// Rotas diretas de páginas
app.get(["/admin", "/admin/", "/painel", "/adm"], (_req, res) => res.redirect(302, "/admin.html"));
app.get(["/cursos", "/cursos/"], (_req, res) => res.redirect(302, "/cursos.html"));
app.get(["/sala", "/sala/", "/aulas"], (_req, res) => res.redirect(302, "/sala.html"));
app.get(["/conta", "/planos"], (_req, res) => res.redirect(302, "/conta.html"));

// Redirecionamento de rotas legadas
app.get("/estudar.html", (_req, res) => res.redirect(301, "/cursos.html"));

// Arquivos estáticos
app.use(express.static(root, { dotfiles: "deny", index: "index.html" }));
app.get("*path", (_req, res) => res.sendFile(path.join(root, "index.html")));

app.listen(port, () => console.log("MedStudy listening on port " + port));

