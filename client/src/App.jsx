import React,{useEffect,useMemo,useState} from "react";
import {PayPalScriptProvider,PayPalButtons} from "@paypal/react-paypal-js";
import {LayoutDashboard,BrainCircuit,Store,WalletCards,ReceiptText,Settings,Search,Bell,Plus,ArrowUpRight,ArrowDownRight,Sparkles,CheckCircle2,Clock3,ShieldCheck,ChevronRight,LoaderCircle,AlertTriangle,Send,FileText,Menu,X,RefreshCw} from "lucide-react";

const API=import.meta.env.VITE_API_URL||"http://localhost:4000";
const inr=n=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0);
async function call(path,options={}){const r=await fetch(API+path,{headers:{"Content-Type":"application/json"},...options});const j=await r.json();if(!r.ok)throw new Error(j.error||"Request failed");return j}
const demoPrompt="We are organizing a college technical fest for 100 students. Our budget is 25000 INR. We need food, stationery, certificates and decorations.";
function Stat({label,value,change,icon:Icon,tone="blue"}){return <div className="stat card"><div className="stat-top"><span>{label}</span><span className={`iconbox ${tone}`}><Icon size={18}/></span></div><strong>{value}</strong><small>{change}</small></div>}

function App() {
  const [tab, setTab] = useState("Overview");
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState("25000");
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState("");
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);
  const [paypalId, setPaypalId] = useState("");

  const [showVendorForm, setShowVendorForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState({
    vendor: "",
    item: "",
    category: "Food",
    unitPrice: "",
    delivery: "",
    minimum: 1
  });

 const refresh=async()=>{try{const [d,c]=await Promise.all([call("/api/dashboard"),call("/api/catalog")]);setData(d);setCatalog(c)}catch(e){setError(e.message)}};
 useEffect(()=>{refresh();},[]);
 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(""),3500);return()=>clearTimeout(t)}},[toast]);
 const completed=data?.transactions||[],spent=data?.spent||0,budgetValue=data?.budget||25000;
 const paypalConfigured=data?.paypalConfigured||false;
 const activePlan=plan||data?.purchases?.[0];
 const generate=async()=>{setBusy(true);setError("");setReport("");try{const p=await call("/api/ai/plan",{method:"POST",body:JSON.stringify({prompt:prompt||demoPrompt,budget:Number(budget)})});setPlan(p);setTab("AI Assistant")}catch(e){setError(e.message)}finally{setBusy(false)}};
 const approve=async()=>{if(!activePlan)return;setBusy(true);try{const p=await call(`/api/purchases/${activePlan.id}/approve`,{method:"POST",body:"{}"});setPlan(p);await refresh();setToast("Purchase plan approved. You can now proceed to PayPal Sandbox.")}catch(e){setError(e.message)}finally{setBusy(false)}};
 
const deletePurchase = async (purchase) => {
  const confirmed = window.confirm(
    `Delete this purchase plan for ${inr(purchase.estimatedTotal)}? This cannot be undone.`
  );

  if (!confirmed) return;

  setBusy(true);
  setError("");

  try {
    await call(`/api/purchases/${purchase.id}`, {
      method: "DELETE"
    });

    if (plan?.id === purchase.id) {
      setPlan(null);
    }

    await refresh();
    setToast("Purchase plan deleted successfully.");
  } catch (e) {
    setError(e.message);
  } finally {
    setBusy(false);
  }
};

const saveVendor = async () => {
  setBusy(true);
  setError("");

  try {
    const url = editingVendor
      ? `/api/catalog/${editingVendor.id}`
      : "/api/catalog";

    await call(url, {
      method: editingVendor ? "PUT" : "POST",
      body: JSON.stringify(vendorForm)
    });

    await refresh();

    setShowVendorForm(false);
    setEditingVendor(null);
    setVendorForm({
      vendor: "",
      item: "",
      category: "Food",
      unitPrice: "",
      delivery: "",
      minimum: 1
    });

    setToast(
      editingVendor
        ? "Vendor listing updated!"
        : "Vendor listing added!"
    );
  } catch (e) {
    setError(e.message);
  } finally {
    setBusy(false);
  }
};

const startEditVendor = (vendor) => {
  setEditingVendor(vendor);
  setVendorForm({
    vendor: vendor.vendor,
    item: vendor.item,
    category: vendor.category,
    unitPrice: vendor.unitPrice,
    delivery: vendor.delivery,
    minimum: vendor.minimum
  });
  setShowVendorForm(true);
};

const deleteVendor = async (vendor) => {
  if (!window.confirm(`Delete ${vendor.item} from ${vendor.vendor}?`)) {
    return;
  }

  setBusy(true);
  setError("");

  try {
    await call(`/api/catalog/${vendor.id}`, {
      method: "DELETE"
    });

    await refresh();
    setToast("Vendor listing deleted!");
  } catch (e) {
    setError(e.message);
  } finally {
    setBusy(false);
  }
};

 const createOrder=async()=>{const r=await call("/api/payments/create-order",{method:"POST",body:JSON.stringify({purchaseId:activePlan.id})});setPaypalId(r.id);return r.id};
const capture = async (details) => {
  setBusy(true);
  setError("");
  try {
    const r = await call("/api/payments/capture-order", {
      method: "POST",
      body: JSON.stringify({
        orderId: details.orderID || paypalId,
        purchaseId: activePlan.id
      })
    });

    setPlan(r.purchase);
    await refresh();
    setToast("PayPal Sandbox payment captured and verified!");
  } catch (e) {
    console.error("PAYPAL CAPTURE ERROR:", e);
    setError(`Payment capture failed: ${e.message}`);
  } finally {
    setBusy(false);
  }
}; const makeReport=async()=>{setBusy(true);try{const r=await call("/api/ai/report",{method:"POST"});setReport(r.report)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const nav=[["Overview",LayoutDashboard],["AI Assistant",BrainCircuit],["Vendors",Store],["Approvals",ShieldCheck],["Transactions",ReceiptText]];
 const pending=data?.purchases?.filter(p=>p.status==="PENDING_APPROVAL")||[];
 return <div className="app-shell">
  <aside className={`sidebar ${menu?"open":""}`}><div className="brand"><div className="brand-mark"><WalletCards size={22}/></div><div>clubpay<span>AI</span><small>SMART PROCUREMENT</small></div><button className="mobile-close" onClick={()=>setMenu(false)}><X/></button></div>
   <div className="workspace"><div className="avatar">TC</div><div><b>Tech Club</b><small>Workspace · Admin</small></div><ChevronRight size={15}/></div>
   <label className="nav-label">WORKSPACE</label>{nav.map(([name,Icon])=><button key={name} className={`nav-item ${tab===name?"active":""}`} onClick={()=>{setTab(name);setMenu(false)}}><Icon size={18}/>{name}{name==="Approvals"&&pending.length>0&&<i>{pending.length}</i>}</button>)}
   <div className="sidebar-bottom"><div className="help-card"><Sparkles size={17}/><b>Smarter spending starts here</b><p>Let your AI procurement assistant plan purchases within your budget.</p><button onClick={()=>setTab("AI Assistant")}>Try AI assistant <ArrowUpRight size={14}/></button></div><button className="nav-item"><Settings size={18}/>Settings</button><div className="profile"><div className="avatar pink">SC</div><div><b>Student Coordinator</b><small>Demo account</small></div><ChevronRight size={15}/></div></div>
  </aside>
  <main className="main"><header className="topbar"><button className="mobile-menu" onClick={()=>setMenu(true)}><Menu/></button><div className="crumb">Workspace <ChevronRight size={14}/><b>{tab}</b></div><div className="top-actions"><span className="sandbox"><span/> SANDBOX MODE</span><button className="icon-button"><Bell size={18}/></button><div className="avatar">TC</div></div></header>
   <div className="content">
    {error&&<div className="alert error"><AlertTriangle size={17}/>{error}<button onClick={()=>setError("")}>Dismiss</button></div>}
    {tab==="Overview"&&<><div className="page-heading"><div><div className="eyebrow">TUESDAY, YOUR FINANCE OVERVIEW</div><h1>Good evening, coordinator <span>✦</span></h1><p>Here's what's happening with your club's finances.</p></div><button className="primary" onClick={()=>setTab("AI Assistant")}><Plus size={17}/> New purchase plan</button></div>
     <div className="stats-grid"><Stat label="Total budget" value={inr(budgetValue)} change="Current event allocation" icon={WalletCards}/><Stat label="Total spent" value={inr(spent)} change={`${budgetValue?Math.round(spent/budgetValue*100):0}% of allocated budget`} icon={ArrowUpRight} tone="purple"/><Stat label="Remaining balance" value={inr(budgetValue-spent)} change="Available to allocate" icon={ArrowDownRight} tone="green"/><Stat label="Pending approvals" value={pending.length} change="Awaiting your review" icon={Clock3} tone="orange"/></div>
     <div className="overview-grid"><section className="card budget-card"><div className="section-head"><div><h3>Budget utilization</h3><p>Track your event spending at a glance</p></div><span className="pill">Current event</span></div><div className="budget-number"><strong>{inr(spent)}</strong><span>of {inr(budgetValue)}</span></div><div className="progress"><span style={{width:`${Math.min(100,budgetValue?spent/budgetValue*100:0)}%`}}/></div><div className="budget-legend"><span><i className="dot purple-dot"/>Spent <b>{Math.round(budgetValue?spent/budgetValue*100:0)}%</b></span><span><i className="dot gray-dot"/>Remaining <b>{inr(budgetValue-spent)}</b></span></div><div className="insight"><Sparkles size={17}/><div><b>Budget insight</b><p>{spent===0?"Your budget is ready. Create a procurement plan to get started.":`You have ${inr(budgetValue-spent)} remaining. Review new requests before approving.`}</p></div></div></section>
      <section className="card activity-card"><div className="section-head"><div><h3>Recent transactions</h3><p>Your latest payment activity</p></div><button className="text-btn" onClick={()=>setTab("Transactions")}>View all <ArrowUpRight size={14}/></button></div>{completed.length===0?<div className="empty"><div className="empty-icon"><ReceiptText/></div><b>No transactions yet</b><p>Completed PayPal Sandbox payments will appear here.</p></div>:completed.slice(0,4).map(t=><div className="transaction-row" key={t.id}><div className="vendor-icon"><Store size={17}/></div><div className="transaction-info"><b>Procurement payment</b><small>{new Date(t.createdAt).toLocaleString()}</small></div><div className="transaction-amount">
  <b>{inr(t.amountInr)}</b>
  <small>
    <span className={`status ${t.status === "COMPLETED" ? "paid" : "pending"}`}>
      {t.status.replaceAll("_", " ")}
    </span>
  </small>
</div></div>)}</section></div>
     <section className="card bottom-card"><div className="section-head"><div><h3>Quick actions</h3><p>Move your event planning forward</p></div></div><div className="quick-grid"><button onClick={()=>setTab("AI Assistant")}><div className="quick-icon violet"><BrainCircuit/></div><b>Plan with AI</b><small>Build a budget-aware purchase plan</small><ChevronRight/></button><button onClick={()=>setTab("Vendors")}><div className="quick-icon blue"><Store/></div><b>Compare vendors</b><small>Explore the sample vendor catalogue</small><ChevronRight/></button><button onClick={()=>setTab("Approvals")}><div className="quick-icon green"><ShieldCheck/></div><b>Review approvals</b><small>{pending.length} requests need your attention</small><ChevronRight/></button></div></section>
    </>}
    {tab==="AI Assistant"&&<><div className="page-heading"><div><div className="eyebrow">YOUR PROCUREMENT COPILOT</div><h1>AI Procurement Assistant</h1><p>Describe what your event needs. Get a budget-aware plan in seconds.</p></div><span className="ai-tag"><Sparkles size={15}/> AI POWERED</span></div><div className="assistant-layout"><section className="card prompt-card"><div className="assistant-intro"><div className="ai-orb"><BrainCircuit size={27}/></div><div><b>Let's plan something great.</b><p>I'll compare sample vendors and help you make every rupee count.</p></div></div><label className="field-label">WHAT ARE YOU ORGANIZING?</label><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="e.g. We're hosting a college fest for 100 students. We need food, stationery, certificates and decorations..." rows={6}/><div className="form-row"><div><label className="field-label">TOTAL BUDGET (INR)</label><div className="input-wrap"><span>₹</span><input type="number" min="1" value={budget} onChange={e=>setBudget(e.target.value)}/></div></div><button className="primary generate-btn" disabled={busy} onClick={generate}>{busy?<LoaderCircle className="spin"/>:<Sparkles size={17}/>} Generate plan</button></div><button className="example-link" onClick={()=>{setPrompt(demoPrompt);setBudget("25000")}}>Use example request <ArrowUpRight size={13}/></button></section>
     <section className="card tips-card"><div className="section-head"><h3>Get better recommendations</h3><Sparkles size={17}/></div>{["Tell me the number of attendees","Set a realistic total budget","List the items or services you need","Mention any special requirements"].map((s,i)=><div className="tip" key={s}><span>{String(i+1).padStart(2,"0")}</span>{s}</div>)}<div className="privacy-note"><ShieldCheck size={16}/><span>Human approval is required before any payment. AI cannot spend money on its own.</span></div></section></div>
     {activePlan&&<section className="card plan-card"><div className="section-head"><div><div className="eyebrow">PROCUREMENT RECOMMENDATION · {activePlan.mode==="GROQ"?"GROQ AI":activePlan.mode==="GEMINI"?"GEMINI AI":"DEMO RULES"}</div><h2>Your purchase plan</h2><p>{activePlan.summary}</p></div><span className={`status ${activePlan.status==="PAID"?"paid":activePlan.status==="APPROVED"?"approved":"pending"}`}>{activePlan.status?.replace("_"," ")}</span></div>{activePlan.note&&<div className="demo-note"><AlertTriangle size={15}/>{activePlan.note}</div>}<div className="table-wrap"><table><thead><tr><th>ITEM / VENDOR</th><th>QTY</th><th>UNIT PRICE</th><th>TOTAL</th><th>WHY THIS PICK?</th></tr></thead><tbody>{activePlan.items?.map((it,i)=><tr key={i}><td><b>{it.item}</b><small>{it.vendor} · {it.category}</small></td><td>{it.quantity}</td><td>{inr(it.unitPrice)}</td><td><b>{inr(it.total)}</b></td><td className="reason">{it.reason}</td></tr>)}</tbody></table></div><div className="plan-totals"><div><small>Estimated savings</small><b className="success-text">{inr(activePlan.estimatedSavings)}</b></div><div><small>Estimated total</small><b>{inr(activePlan.estimatedTotal)}</b></div><div><small>Budget remaining</small><b>{inr(activePlan.remaining)}</b></div></div>{activePlan.warnings?.map(w=><div className="alert error" key={w}><AlertTriangle size={15}/>{w}</div>)}{activePlan.status==="PENDING_APPROVAL"&&<button className="primary" disabled={busy||activePlan.estimatedTotal>activePlan.budget} onClick={approve}><ShieldCheck size={17}/> Approve purchase plan</button>}{activePlan.status==="APPROVED"&&<div className="pay-area"><div className="demo-note"><ShieldCheck size={15}/> Approved by you. PayPal Sandbox is the next step. INR to USD uses a fixed demo assumption of ₹85 per USD, not a live exchange rate.</div>{paypalConfigured?<PayPalScriptProvider options={{"client-id":data?.paypalClientId,currency:"USD",intent:"capture"}}><PayPalButtons style={{layout:"vertical",label:"paypal"}} createOrder={async()=>{const id=await createOrder();return id}} onApprove={async d=>{await capture(d)}} onError={e=>setError(e.message||"PayPal checkout failed.")}/></PayPalScriptProvider>:<div className="alert warning">Add PayPal Sandbox credentials to the server .env to enable checkout. No payment will be simulated.</div>}</div>}{activePlan.status==="PAID"&&<div className="alert success"><CheckCircle2/> PayPal Sandbox payment captured and verified.</div>}</section>}
    </>}
   
{tab==="Vendors"&&<>
  <div className="page-heading">
    <div>
      <div className="eyebrow">VENDOR MARKETPLACE</div>
      <h1>Vendor directory</h1>
      <p>Manage your own vendors and compare sample listings.</p>
    </div>
    <button className="primary" onClick={()=>{
      setEditingVendor(null);
      setVendorForm({vendor:"",item:"",category:"Food",unitPrice:"",delivery:"",minimum:1});
      setShowVendorForm(true);
    }}>
      <Plus size={17}/> Add vendor
    </button>
  </div>

  {showVendorForm&&<div className="card prompt-card">
    <div className="section-head">
      <h3>{editingVendor?"Edit vendor":"Add a new vendor"}</h3>
      <button className="secondary" onClick={()=>{
        setShowVendorForm(false);
        setEditingVendor(null);
      }}>Cancel</button>
    </div>

    <div className="vendor-form-grid">
      <div><label className="field-label">VENDOR NAME</label>
        <input value={vendorForm.vendor} onChange={e=>setVendorForm({...vendorForm,vendor:e.target.value})} placeholder="Royal Caterers"/>
      </div>
      <div><label className="field-label">PRODUCT / SERVICE</label>
        <input value={vendorForm.item} onChange={e=>setVendorForm({...vendorForm,item:e.target.value})} placeholder="Meal box"/>
      </div>
      <div><label className="field-label">CATEGORY</label>
        <select value={vendorForm.category} onChange={e=>setVendorForm({...vendorForm,category:e.target.value})}>
          {["Food","Printing","Stationery","Decorations","Equipment","Other"].map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      <div><label className="field-label">UNIT PRICE (INR)</label>
        <input type="number" min="1" value={vendorForm.unitPrice} onChange={e=>setVendorForm({...vendorForm,unitPrice:e.target.value})} placeholder="150"/>
      </div>
      <div><label className="field-label">DELIVERY TIME</label>
        <input value={vendorForm.delivery} onChange={e=>setVendorForm({...vendorForm,delivery:e.target.value})} placeholder="2 days"/>
      </div>
      <div><label className="field-label">MINIMUM ORDER</label>
        <input type="number" min="1" value={vendorForm.minimum} onChange={e=>setVendorForm({...vendorForm,minimum:e.target.value})}/>
      </div>
    </div>

    <button className="primary" disabled={busy} onClick={saveVendor}>
      {busy?"Saving...":editingVendor?"Save changes":"Add vendor"}
    </button>
  </div>}

  <div className="vendor-grid">
    {catalog.map(v=><div className="card vendor-card" key={v.id}>
      <div className="vendor-icon large"><Store/></div>
      <div className="vendor-title">
        <b>{v.vendor}</b>
        <span>{v.isCustom?"Your vendor":v.rating?`★ ${v.rating}`:"Sample vendor"}</span>
      </div>
      <p>{v.item} · {v.category}</p>
      <div className="vendor-price">{inr(v.unitPrice)} <small>/ unit</small></div>
      <div className="vendor-meta">
        <span>{v.delivery}</span><span>Min. {v.minimum}</span>
      </div>
      {v.isCustom&&<div className="vendor-actions">
        <button className="secondary small-btn" onClick={()=>startEditVendor(v)}>Edit</button>
        <button className="secondary small-btn" disabled={busy} onClick={()=>deleteVendor(v)}>Delete</button>
      </div>}
    </div>)}
  </div>
</>}

{tab==="Approvals"&&<><div className="page-heading"><div><div className="eyebrow">HUMAN-IN-THE-LOOP CONTROL</div><h1>Purchase approvals</h1><p>Review AI-generated plans before any payment can happen.</p></div></div><div className="card approval-list">{(data?.purchases||[]).length===0?<div className="empty"><ShieldCheck/><b>Nothing to approve</b><p>Create a plan with the AI assistant to see it here.</p></div>:(data.purchases||[]).map(p=><div className="approval-row" key={p.id}><div className="vendor-icon"><FileText/></div><div className="approval-info"><b>{p.summary}</b><small>{p.items?.length||0} line items · {new Date(p.createdAt).toLocaleString()}</small></div><b>{inr(p.estimatedTotal)}</b><span className={`status ${p.status==="PAID"?"paid":p.status==="APPROVED"?"approved":"pending"}`}>{p.status.replace("_"," ")}</span>
<button className="secondary small-btn" onClick={()=>{setPlan(p);setTab("AI Assistant")}}>Review</button>

<button
  className="secondary small-btn"
  onClick={() => deletePurchase(p)}
  disabled={busy}
>
  Delete
</button>    </div>)}</div></>}
    {tab==="Transactions"&&<><div className="page-heading"><div><div className="eyebrow">PAYMENT AUDIT TRAIL</div><h1>Transactions</h1><p>Verified PayPal Sandbox captures recorded by the server.</p></div><button className="secondary" onClick={refresh}><RefreshCw size={15}/> Refresh</button></div><div className="card table-card"><div className="table-wrap"><table><thead><tr><th>TRANSACTION</th><th>PAYPAL ORDER</th><th>DATE</th><th>AMOUNT (INR EST.)</th><th>STATUS</th></tr></thead><tbody>{(data?.transactions || []).map(t=><tr key={t.id}><td><b>{t.id.slice(0,8)}</b></td><td>{t.paypalOrderId}</td><td>{new Date(t.createdAt).toLocaleString()}</td><td><b>{inr(t.amountInr)}</b></td><td>
  <span className={`status ${t.status === "COMPLETED" ? "paid" : "pending"}`}>
    {t.status.replaceAll("_", " ")}
  </span>
</td></tr>)}</tbody></table>{(data?.transactions || []).length===0&&<div className="empty"><ReceiptText/><b>No completed payments</b><p>Sandbox payments appear here after PayPal confirms capture.</p></div>}</div></div><section className="card report-card"><div className="section-head"><div><h3>AI financial report</h3><p>Summarize verified spending and remaining budget.</p></div><button className="primary" disabled={busy} onClick={makeReport}><Sparkles size={16}/> Generate report</button></div>{report && (
  <div className="report-text">
    {report.split("\n")
      .map(line => line.trim())
      .filter(line => line && line !== "---")
      .map((line, i) => {
        const clean = line
          .replace(/^#{1,6}\s*/, "")
          .replace(/\*\*/g, "")
          .replace(/^\*\s+/, "• ")
          .replace(/`/g, "");

        return <p key={i}>{clean}</p>;
      })}
  </div>
)}</section></>}
    <footer>ClubPay AI <span>·</span> AI-assisted procurement with PayPal Sandbox <span>·</span> Demo environment only</footer>
   </div>
  </main>{toast&&<div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
 </div>
}
export default App;
