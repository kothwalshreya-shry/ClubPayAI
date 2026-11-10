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
import { catalog } from "./catalog.js";
import { readStore, writeStore } from "./store.js";
import { createPlan, createReport } from "./ai.js";
import { paypalConfigured, createPaypalOrder, capturePaypalOrder } from "./paypal.js";

const app=express();
app.use(helmet({crossOriginResourcePolicy:{policy:"cross-origin"}}));
app.use(cors({origin:process.env.CLIENT_ORIGIN?.split(",") || "http://localhost:5173"}));
app.use(express.json({limit:"1mb"}));
const port=Number(process.env.PORT||4000);
const INR_PER_USD=85; // Demo conversion assumption; disclose in UI and README.
const money=n=>Math.round(Number(n)||0);

app.get("/api/health",(req,res)=>res.json({ok:true,service:"clubpay-ai",paypalConfigured:paypalConfigured()}));
app.get("/api/catalog",(req,res)=>res.json(catalog));
app.get("/api/dashboard",(req,res)=>{
  const db=readStore(), spent=db.transactions.filter(t=>t.status==="COMPLETED").reduce((s,t)=>s+t.amountInr,0);
  res.json({budget:db.budget,spent,remaining:db.budget-spent,purchases:db.purchases,transactions:db.transactions,paypalConfigured:paypalConfigured(),paypalClientId:process.env.PAYPAL_CLIENT_ID||""});
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
app.post("/api/payments/capture-order",async(req,res)=>{
  try {
    if(!paypalConfigured()) return res.status(503).json({error:"PayPal Sandbox is not configured."});
    const {orderId,purchaseId}=req.body, db=readStore(), purchase=db.purchases.find(p=>p.id===purchaseId);
    if(!purchase||purchase.status!=="APPROVED"||purchase.paypalOrderId!==orderId) return res.status(400).json({error:"Order does not match an approved purchase."});
    if(db.transactions.some(t=>t.paypalOrderId===orderId&&t.status==="COMPLETED")) return res.status(409).json({error:"This PayPal order has already been recorded."});
    const capture = await capturePaypalOrder(orderId);

console.log(
  "FULL PAYPAL CAPTURE RESPONSE:",
  JSON.stringify(capture, null, 2)
);

const unit = capture.purchase_units?.[0];
const cap = unit?.payments?.captures?.[0];

if (capture.status !== "COMPLETED" || cap?.status !== "COMPLETED") {
  return res.status(400).json({
    error: "PayPal has not confirmed a completed capture.",
    orderStatus: capture.status,
    captureStatus: cap?.status || "MISSING",
    captureDetails: capture
  });
}
    const currency=cap.amount?.currency_code, value=Number(cap.amount?.value);
    const expected=Number((purchase.estimatedTotal/INR_PER_USD).toFixed(2));
    if(currency!==(process.env.PAYPAL_CURRENCY||"USD")||Math.abs(value-expected)>0.01) return res.status(400).json({error:"Captured amount or currency does not match the approved plan."});
    const transaction={id:uuid(),purchaseId,paypalOrderId:orderId,captureId:cap.id,status:"COMPLETED",amountInr:purchase.estimatedTotal,paypalAmount:value,currency,createdAt:new Date().toISOString()};
    db.transactions.unshift(transaction); purchase.status="PAID"; purchase.paidAt=transaction.createdAt; writeStore(db);
    res.json({transaction,purchase});
  }catch(e){res.status(502).json({error:e.message});}
});
app.get("/api/payments/history",(req,res)=>res.json(readStore().transactions));
app.post("/api/ai/report",async(req,res)=>{
  const db=readStore(), spent=db.transactions.filter(t=>t.status==="COMPLETED").reduce((s,t)=>s+t.amountInr,0);
  res.json(await createReport({budget:db.budget,spent,transactions:db.transactions}));
});
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"Unexpected server error."});});
app.listen(port,()=>console.log(`ClubPay API running at http://localhost:${port}`));
