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
  lifetime: { name: process.env.PLAN_LIFETIME_NAME || "MedStudy Vitalício", price: 750, display: process.env.PLAN_LIFETIME_DISPLAY || "R$ 750, pagamento único" }
};

const coursesFilePath = path.join(root, "courses.json");
const manualSubscribersFilePath = path.join(root, "manual-subscribers.json");
const siteConfigFilePath = path.join(root, "site-config.json");

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
  if (found.planId === "lifetime") return true;
  if (found.current_period_end && new Date(found.current_period_end) > new Date()) return true;
  return false;
}


const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@medstudy.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "medstudy2026";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "medstudy-secret-admin-signature-key-2026";

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

function configured(res) {
  const absent = [...missing, ...(!process.env.MP_ACCESS_TOKEN ? ["MP_ACCESS_TOKEN"] : [])];
  if (absent.length) {
    res.status(503).json({ error: "O serviço ainda precisa ser configurado no Render.", missing: absent });
    return false;
  }
  return true;
}

async function mpRequest(endpoint, options = {}) {
  const response = await fetch("https://api.mercadopago.com" + endpoint, {
    ...options,
    headers: { Authorization: "Bearer " + process.env.MP_ACCESS_TOKEN, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Mercado Pago request failed:", response.status, JSON.stringify(data));
    throw new Error("O Mercado Pago não conseguiu iniciar ou confirmar o pagamento.");
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

function validMpSignature(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET || "";
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
  if (!supabaseAdmin || !process.env.MP_ACCESS_TOKEN || !process.env.MP_WEBHOOK_SECRET) return res.status(503).send("Webhook is not configured.");
  const topic = String(req.query.type || req.query.topic || req.body?.type || "");
  const dataId = String(req.query["data.id"] || req.body?.data?.id || "");
  if (!validMpSignature(req, dataId)) return res.status(401).send("Invalid signature.");
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
  if (!configured(res)) return;
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

app.get("/api/config", (_req, res) => res.json({
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  configured: missing.length === 0 && Boolean(process.env.MP_ACCESS_TOKEN),
  plans: Object.fromEntries(Object.entries(plans).map(([id, plan]) => [id, {
    name: plan.name, price: plan.display,
    available: Boolean(process.env.MP_ACCESS_TOKEN && process.env.APP_URL)
  }]))
}));

app.get("/api/me", requireUser, async (req, res) => {
  const { data } = await supabaseAdmin.from("user_subscriptions").select("plan_id,status,current_period_end").eq("user_id", req.user.id).maybeSingle();
  const active = Boolean(data?.status === "active" && (
    data.plan_id === "lifetime" || (data.current_period_end && new Date(data.current_period_end) > new Date())
  ));
  res.json({ user: { id: req.user.id, email: req.user.email }, subscription: data || null, active });
});

app.post("/api/checkout", requireUser, async (req, res) => {
  const planId = req.body?.plan;
  const plan = plans[planId];
  if (!plan) return res.status(400).json({ error: "Plano inválido." });
  if (!process.env.MP_ACCESS_TOKEN || !process.env.APP_URL) return res.status(503).json({ error: "Mercado Pago ainda não foi configurado no Render." });
  if (!req.user.email) return res.status(400).json({ error: "Sua conta precisa ter um e-mail válido." });
  try {
    const externalReference = `medstudy:${req.user.id}:${planId}:${randomUUID()}`;
    const returnUrl = new URL("/conta.html?checkout=return", process.env.APP_URL).toString();
    let checkout;
    if (planId === "lifetime") {
      checkout = await mpRequest("/checkout/preferences", {
        method: "POST",
        body: JSON.stringify({
          items: [{ id: "medstudy-lifetime", title: plan.name, description: plan.display, quantity: 1, currency_id: "BRL", unit_price: plan.price }],
          external_reference: externalReference,
          back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
          auto_return: "approved",
          notification_url: new URL("/api/mercadopago/webhook?source=news&topic=payment", process.env.APP_URL).toString()
        })
      });
    } else {
      checkout = await mpRequest("/preapproval", {
        method: "POST",
        body: JSON.stringify({
          reason: plan.name,
          external_reference: externalReference,
          payer_email: req.user.email,
          auto_recurring: { frequency: plan.frequency, frequency_type: plan.frequencyType, transaction_amount: plan.price, currency_id: "BRL" },
          back_url: returnUrl,
          status: "pending"
        })
      });
    }
    const checkoutUrl = checkout.init_point;
    if (!checkoutUrl) throw new Error("O Mercado Pago não retornou o link de pagamento.");
    const subscriptionFields = planId === "lifetime"
      ? { mp_preference_id: String(checkout.id) }
      : { mp_preapproval_id: String(checkout.id) };
    const { error } = await supabaseAdmin.from("user_subscriptions").upsert({
      user_id: req.user.id, plan_id: planId, status: "pending", current_period_end: null,
      mp_external_reference: externalReference, ...subscriptionFields, updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (error) throw error;
    res.json({ url: checkoutUrl });
  } catch (error) {
    console.error("Mercado Pago checkout creation failed:", error.message);
    res.status(502).json({ error: error.message || "Não foi possível iniciar o checkout." });
  }
});

// ==========================================
// CATÁLOGO DE CURSOS DO GOOGLE DRIVE
// ==========================================
app.get("/api/courses", async (req, res) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  const isAdmin = verifyAdminToken(token);
  let userActive = isAdmin;
  let user = isAdmin ? { id: "admin-master", email: ADMIN_EMAIL, role: "admin" } : null;

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
  if (user?.email && !userActive) {
    userActive = isManualSubscriberActive(user.email, manualSubs);
  }

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
    isAdmin
  });
});

app.get("/api/courses/:id", async (req, res) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  const isAdmin = verifyAdminToken(token);
  let userActive = isAdmin;
  let user = isAdmin ? { id: "admin-master", email: ADMIN_EMAIL, role: "admin" } : null;

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

        userActive = Boolean(
          subData?.status === "active" && (
            subData.plan_id === "lifetime" ||
            (subData.current_period_end && new Date(subData.current_period_end) > new Date())
          )
        );
      }
    } catch (e) {
      console.error("Error validating auth in /api/courses/:id:", e.message);
    }
  }

  // Verifica liberação manual
  const manualSubs = await loadManualSubscribers();
  if (user?.email && !userActive) {
    userActive = isManualSubscriberActive(user.email, manualSubs);
  }

  const allCourses = await loadCourses();
  const found = allCourses.find((c) => c.id === req.params.id);
  if (!found) {
    return res.status(404).json({ error: "Curso não encontrado." });
  }

  const course = userActive ? { ...found, locked: false } : { ...found, driveUrl: null, locked: true };
  res.json({ course, userActive, user, isAdmin });
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
app.post("/api/admin/login", (req, res) => {
  const { email, password } = req.body || {};
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = createAdminToken();
    return res.json({ ok: true, token, email: ADMIN_EMAIL, role: "admin" });
  }
  return res.status(401).json({ error: "Credenciais de administrador incorretas." });
});

app.get("/api/admin/verify", requireAdmin, (_req, res) => {
  res.json({ ok: true, email: ADMIN_EMAIL, role: "admin" });
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
  res.json(config);
});

app.post("/api/admin/site-config", requireAdmin, async (req, res) => {
  const { whatsappNumber, pixKey, pixName } = req.body || {};
  const current = await loadSiteConfig();
  const updated = {
    ...current,
    whatsappNumber: whatsappNumber !== undefined ? String(whatsappNumber).trim() : current.whatsappNumber,
    pixKey: pixKey !== undefined ? String(pixKey).trim() : current.pixKey,
    pixName: pixName !== undefined ? String(pixName).trim() : current.pixName
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

// Redirecionamento de rotas legadas
app.get("/estudar.html", (_req, res) => res.redirect(301, "/cursos.html"));

// Arquivos estáticos
app.use(express.static(root, { dotfiles: "deny", index: "index.html" }));
app.get("*path", (_req, res) => res.sendFile(path.join(root, "index.html")));

app.listen(port, () => console.log("MedStudy listening on port " + port));

