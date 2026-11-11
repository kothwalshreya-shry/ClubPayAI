import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env")
});
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { v4 as uuid } from "uuid";
import {
  getCatalog,
  saveCustomCatalog
} from "./catalog.js";
import { readStore, writeStore } from "./store.js";
import { createPlan, createReport } from "./ai.js";
import {
  paypalConfigured,
  createPaypalOrder,
  capturePaypalOrder,
  getPaypalCapture,
  getPaypalOrder
} from "./paypal.js";

const app=express();
app.use(helmet({crossOriginResourcePolicy:{policy:"cross-origin"}}));
const allowedOrigins = [
  "https://club-pay-ai.vercel.app",
  "http://localhost:5173"
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
}));
app.use(express.json({limit:"1mb"}));
const port=Number(process.env.PORT||4000);
const INR_PER_USD=85; // Demo conversion assumption; disclose in UI and README.
const money=n=>Math.round(Number(n)||0);

app.get("/api/health",(req,res)=>res.json({ok:true,service:"clubpay-ai",paypalConfigured:paypalConfigured()}));
app.get("/api/catalog", (req, res) => {
  res.json(getCatalog());
});
app.get("/api/dashboard",(req,res)=>{
  const db=readStore(), spent=db.transactions.filter(t=>t.status==="COMPLETED").reduce((s,t)=>s+t.amountInr,0);
  res.json({budget:db.budget,spent,remaining:db.budget-spent,purchases:db.purchases,transactions:db.transactions,paypalConfigured:paypalConfigured(),paypalClientId:process.env.PAYPAL_CLIENT_ID||""});
});

app.post("/api/catalog", (req, res) => {
  const {
    vendor,
    item,
    category,
    unitPrice,
    delivery,
    minimum
  } = req.body;

  if (
    !vendor?.trim() ||
    !item?.trim() ||
    !category?.trim() ||
    !Number.isFinite(Number(unitPrice)) ||
    Number(unitPrice) <= 0 ||
    !delivery?.trim() ||
    !Number.isInteger(Number(minimum)) ||
    Number(minimum) < 1
  ) {
    return res.status(400).json({
      error: "Please provide valid vendor and product details."
    });
  }

  const db = readStore();
  db.customCatalog ||= [];

  const newItem = {
    id: `custom-${crypto.randomUUID()}`,
    vendor: vendor.trim(),
    item: item.trim(),
    category: category.trim(),
    unitPrice: Number(unitPrice),
    rating: null,
    delivery: delivery.trim(),
    minimum: Number(minimum),
    isCustom: true
  };

  db.customCatalog.push(newItem);
  writeStore(db);

  res.status(201).json(newItem);
});

app.put("/api/catalog/:id", (req, res) => {
  const db = readStore();
  db.customCatalog ||= [];

  const vendorItem = db.customCatalog.find(
    item => item.id === req.params.id
  );

  if (!vendorItem) {
    return res.status(404).json({
      error: "Custom vendor listing not found."
    });
  }

  const {
    vendor,
    item,
    category,
    unitPrice,
    delivery,
    minimum
  } = req.body;

  if (
    !vendor?.trim() ||
    !item?.trim() ||
    !category?.trim() ||
    !Number.isFinite(Number(unitPrice)) ||
    Number(unitPrice) <= 0 ||
    !delivery?.trim() ||
    !Number.isInteger(Number(minimum)) ||
    Number(minimum) < 1
  ) {
    return res.status(400).json({
      error: "Please provide valid vendor and product details."
    });
  }

  Object.assign(vendorItem, {
    vendor: vendor.trim(),
    item: item.trim(),
    category: category.trim(),
    unitPrice: Number(unitPrice),
    delivery: delivery.trim(),
    minimum: Number(minimum)
  });

  writeStore(db);
  res.json(vendorItem);
});

app.delete("/api/catalog/:id", (req, res) => {
  const db = readStore();
  db.customCatalog ||= [];

  const index = db.customCatalog.findIndex(
    item => item.id === req.params.id
  );

  if (index === -1) {
    return res.status(404).json({
      error: "Custom vendor listing not found."
    });
  }

  const [deleted] = db.customCatalog.splice(index, 1);

  writeStore(db);

  res.json({
    message: "Vendor listing deleted successfully.",
    id: deleted.id
  });
});

app.post("/api/ai/plan",async(req,res)=>{
  try {
    const prompt=String(req.body.prompt||"").trim(), budget=money(req.body.budget||25000);
    if(prompt.length<10) return res.status(400).json({error:"Please describe your event and purchasing needs."});
    if(budget<1||budget>10000000) return res.status(400).json({error:"Enter a valid budget."});
    const plan=await createPlan(prompt,budget);
    const purchase={id:uuid(),...plan,status:"PENDING_APPROVAL",createdAt:new Date().toISOString()};
    const db=readStore(); db.purchases.unshift(purchase); db.budget=budget; writeStore(db);
    res.json(purchase);
  } catch(e) {res.status(500).json({error:e.message});}
});
app.post("/api/purchases/:id/approve",(req,res)=>{
  const db=readStore(), purchase=db.purchases.find(p=>p.id===req.params.id);
  if(!purchase) return res.status(404).json({error:"Purchase plan not found."});
  if(purchase.status!=="PENDING_APPROVAL") return res.status(409).json({error:"Purchase is not awaiting approval."});
  if(!purchase.items?.length || purchase.estimatedTotal<=0) return res.status(400).json({error:"Invalid purchase plan."});
  if(purchase.estimatedTotal>purchase.budget) return res.status(400).json({error:"Plan exceeds its approved budget."});
  purchase.status="APPROVED"; purchase.approvedAt=new Date().toISOString(); writeStore(db); res.json(purchase);
});

app.delete("/api/purchases/:id", (req, res) => {
  const db = readStore();

  const purchase = db.purchases.find(
    p => p.id === req.params.id
  );

  if (!purchase) {
    return res.status(404).json({
      error: "Purchase plan not found."
    });
  }

  const hasTransaction = db.transactions.some(
    t => t.purchaseId === purchase.id
  );

  if (
    purchase.status === "PAYMENT_PENDING" ||
    purchase.status === "PAID" ||
    hasTransaction
  ) {
    return res.status(409).json({
      error: "This purchase has payment records and cannot be deleted. Archive it instead."
    });
  }

  db.purchases = db.purchases.filter(
    p => p.id !== purchase.id
  );

  writeStore(db);

  return res.json({
    message: "Purchase plan deleted successfully.",
    id: purchase.id
  });
});

app.post("/api/payments/create-order",async(req,res)=>{
  try {
    if(!paypalConfigured()) return res.status(503).json({error:"PayPal Sandbox is not configured. Add server-side credentials to .env."});
    const db=readStore(), purchase=db.purchases.find(p=>p.id===req.body.purchaseId);
    if(!purchase||purchase.status!=="APPROVED") return res.status(400).json({error:"Only an approved purchase plan can be paid."});
    const existing=db.transactions.find(t=>t.purchaseId===purchase.id && t.status==="COMPLETED");
    if(existing) return res.status(409).json({error:"This purchase has already been paid."});
    const amount=(purchase.estimatedTotal/INR_PER_USD).toFixed(2), currency=process.env.PAYPAL_CURRENCY||"USD";
    const order=await createPaypalOrder(Number(amount),currency);
    db.purchases.find(p=>p.id===purchase.id).paypalOrderId=order.id; writeStore(db);
    res.json({id:order.id,links:order.links,amount,currency,amountInr:purchase.estimatedTotal,exchangeRateAssumption:INR_PER_USD});
  } catch(e){res.status(502).json({error:e.message});}
});

app.post("/api/payments/capture-order", async (req, res) => {
  try {
    if (!paypalConfigured()) {
      return res.status(503).json({
        error: "PayPal Sandbox is not configured."
      });
    }

    const { orderId, purchaseId } = req.body;
    const db = readStore();

    const purchase = db.purchases.find(p => p.id === purchaseId);

    if (!purchase || purchase.paypalOrderId !== orderId) {
      return res.status(400).json({
        error: "Order does not match the purchase."
      });
    }

    // Return an existing record instead of capturing twice.
    const existing = db.transactions.find(
      t => t.paypalOrderId === orderId
    );

    if (existing) {
      return res.json({
        transaction: existing,
        purchase,
        message: "This payment has already been processed."
      });
    }

    if (purchase.status !== "APPROVED") {
      return res.status(400).json({
        error: "Purchase is not approved for payment."
      });
    }

    const capture = await capturePaypalOrder(orderId);
    const unit = capture.purchase_units?.[0];
    const cap = unit?.payments?.captures?.[0];

    console.log("PAYPAL CAPTURE:", JSON.stringify(capture, null, 2));

    if (!cap) {
      return res.status(400).json({
        error: "PayPal did not return capture details.",
        orderStatus: capture.status
      });
    }

    const currency = cap.amount?.currency_code;
    const value = Number(cap.amount?.value);
    const expected = Number(
      (purchase.estimatedTotal / INR_PER_USD).toFixed(2)
    );

    if (
      currency !== (process.env.PAYPAL_CURRENCY || "USD") ||
      !Number.isFinite(value) ||
      Math.abs(value - expected) > 0.01
    ) {
      return res.status(400).json({
        error: "Captured amount or currency does not match the approved plan."
      });
    }

    const isCompleted =
      capture.status === "COMPLETED" &&
      cap.status === "COMPLETED";

    const isPending = cap.status === "PENDING";
    const isDenied = cap.status === "DENIED";

    if (!isCompleted && !isPending && !isDenied) {
      return res.status(400).json({
        error: "PayPal returned an unexpected capture status.",
        orderStatus: capture.status,
        captureStatus: cap.status
      });
    }

    const transaction = {
      id: uuid(),
      purchaseId,
      paypalOrderId: orderId,
      captureId: cap.id,
      status: isCompleted ? "COMPLETED" : isPending ? "PENDING" : "FAILED",
      amountInr: purchase.estimatedTotal,
      paypalAmount: value,
      currency,
      createdAt: new Date().toISOString()
    };

    db.transactions.unshift(transaction);

    if (isCompleted) {
      purchase.status = "PAID";
      purchase.paidAt = transaction.createdAt;
    } else if (isPending) {
      purchase.status = "PAYMENT_PENDING";
    } else {
      purchase.status = "PAYMENT_FAILED";
    }

    writeStore(db);

    return res.json({
      transaction,
      purchase,
      message: isCompleted
        ? "Payment completed successfully."
        : isPending
          ? "Payment is pending PayPal review."
          : "PayPal denied the payment."
    });

  } catch (e) {
    console.error("PAYPAL CAPTURE ERROR:", e);

    return res.status(502).json({
      error: e.message
    });
  }
});

app.get("/api/payments/history",(req,res)=>res.json(readStore().transactions));
app.post("/api/ai/report",async(req,res)=>{
  const db=readStore(), spent=db.transactions.filter(t=>t.status==="COMPLETED").reduce((s,t)=>s+t.amountInr,0);
  res.json(await createReport({budget:db.budget,spent,transactions:db.transactions}));
});

app.get("/api/payments/status/:captureId", async (req, res) => {
  try {
    if (!paypalConfigured()) {
      return res.status(503).json({
        error: "PayPal Sandbox is not configured."
      });
    }

    const db = readStore();

    const transaction = db.transactions.find(
      t => t.captureId === req.params.captureId
    );

    if (!transaction) {
      return res.status(404).json({
        error: "Transaction not found."
      });
    }

    const purchase = db.purchases.find(
      p => p.id === transaction.purchaseId
    );

    if (!purchase) {
      return res.status(404).json({
        error: "Associated purchase not found."
      });
    }

    
if (transaction.status === "COMPLETED") {
  if (purchase.status !== "PAID") {
    purchase.status = "PAID";
    purchase.paidAt = transaction.updatedAt || transaction.createdAt;
    writeStore(db);
  }

  return res.json({ transaction, purchase });
}

if (transaction.status === "FAILED") {
  if (purchase.status !== "PAYMENT_FAILED") {
    purchase.status = "PAYMENT_FAILED";
    writeStore(db);
  }

  return res.json({ transaction, purchase });
}


    const paypalCapture = await getPaypalCapture(
      transaction.captureId
    );

    if (paypalCapture.status === "COMPLETED") {
      transaction.status = "COMPLETED";
      purchase.status = "PAID";
      purchase.paidAt = new Date().toISOString();
    } else if (paypalCapture.status === "DENIED") {
      transaction.status = "FAILED";
      purchase.status = "PAYMENT_FAILED";
    }

    transaction.updatedAt = new Date().toISOString();

    writeStore(db);

    res.json({
      transaction,
      purchase,
      paypalStatus: paypalCapture.status
    });

  } catch (e) {
    console.error("PAYPAL STATUS ERROR:", e);
    res.status(502).json({ error: e.message });
  }
});

app.post("/api/payments/reconcile", async (req, res) => {
  try {
    if (!paypalConfigured()) {
      return res.status(503).json({
        error: "PayPal Sandbox is not configured."
      });
    }

    const { purchaseId, orderId, captureId } = req.body;

    if (!purchaseId || !orderId || !captureId) {
      return res.status(400).json({
        error: "Purchase ID, order ID and capture ID are required."
      });
    }

    const db = readStore();

    const purchase = db.purchases.find(
      p => p.id === purchaseId
    );

    if (!purchase || purchase.paypalOrderId !== orderId) {
      return res.status(400).json({
        error: "Purchase and PayPal order do not match."
      });
    }

    const existing = db.transactions.find(
      t => t.captureId === captureId
    );

    if (existing) {
      return res.json({
        transaction: existing,
        purchase,
        message: "Capture already recorded."
      });
    }

    // Retrieve the actual PayPal order.
    const order = await getPaypalOrder(orderId);

    if (order.id !== orderId) {
      return res.status(400).json({
        error: "PayPal order ID verification failed."
      });
    }

    // Confirm this capture belongs to this exact order.
    const orderCaptures = (order.purchase_units || [])
      .flatMap(unit => unit.payments?.captures || []);

    const matchingCapture = orderCaptures.find(
      capture => capture.id === captureId
    );

    if (!matchingCapture) {
      return res.status(400).json({
        error: "Capture does not belong to the supplied PayPal order."
      });
    }

    // Retrieve the capture's current status directly from PayPal.
    const capture = await getPaypalCapture(captureId);

    if (
      capture.id !== captureId ||
      capture.status !== matchingCapture.status
    ) {
      return res.status(409).json({
        error: "PayPal capture verification mismatch."
      });
    }

    if (!["PENDING", "COMPLETED", "DENIED"].includes(capture.status)) {
      return res.status(409).json({
        error: "Unexpected PayPal capture status.",
        paypalStatus: capture.status
      });
    }

    const expected = Number(
      (purchase.estimatedTotal / INR_PER_USD).toFixed(2)
    );

    const value = Number(capture.amount?.value);
    const currency = capture.amount?.currency_code;

    if (
      currency !== (process.env.PAYPAL_CURRENCY || "USD") ||
      !Number.isFinite(value) ||
      Math.abs(value - expected) > 0.01
    ) {
      return res.status(400).json({
        error: "Capture amount or currency does not match."
      });
    }

    const now = new Date().toISOString();

    const transaction = {
      id: uuid(),
      purchaseId,
      paypalOrderId: orderId,
      captureId,
      status:
        capture.status === "COMPLETED"
          ? "COMPLETED"
          : capture.status === "PENDING"
            ? "PENDING"
            : "FAILED",
      amountInr: purchase.estimatedTotal,
      paypalAmount: value,
      currency,
      createdAt: now
    };

    db.transactions.unshift(transaction);

    if (capture.status === "COMPLETED") {
      purchase.status = "PAID";
      purchase.paidAt = now;
    } else if (capture.status === "PENDING") {
      purchase.status = "PAYMENT_PENDING";
    } else {
      purchase.status = "PAYMENT_FAILED";
    }

    writeStore(db);

    return res.json({
      message: "PayPal payment reconciled successfully.",
      transaction,
      purchase,
      paypalStatus: capture.status
    });

  } catch (e) {
    console.error("RECONCILIATION ERROR:", e);

    return res.status(502).json({
      error: e.message
    });
  }
});


app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"Unexpected server error."});});
app.listen(port,()=>console.log(`ClubPay API running at http://localhost:${port}`));
