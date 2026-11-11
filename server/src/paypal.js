const base = () => process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
export function paypalConfigured() { return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET); }
async function accessToken() {
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${base()}/v1/oauth2/token`, {method:"POST",headers:{Authorization:`Basic ${credentials}`,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "Could not authenticate with PayPal");
  return data.access_token;
}
export async function createPaypalOrder(amount, currency) {
  const token=await accessToken();
  const response=await fetch(`${base()}/v2/checkout/orders`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({
    intent:"CAPTURE",purchase_units:[{amount:{currency_code:currency,value:amount.toFixed(2)},description:"ClubPay AI approved procurement plan"}],
    payment_source:{paypal:{experience_context:{brand_name:"ClubPay AI",user_action:"PAY_NOW",return_url:"http://localhost:5173/payment-return",cancel_url:"http://localhost:5173/payment-cancel"}}}
  })});
  const data=await response.json(); if(!response.ok) throw new Error(data.message || "PayPal order creation failed"); return data;
}
export async function capturePaypalOrder(orderId) {
  const token=await accessToken();
  const response=await fetch(`${base()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"}});
  const data=await response.json(); if(!response.ok) throw new Error(data.message || "PayPal capture failed"); return data;
}

export async function getPaypalCapture(captureId) {
  const token = await accessToken();

  const response = await fetch(
    `${base()}/v2/payments/captures/${encodeURIComponent(captureId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Could not retrieve PayPal capture.");
  }

  return data;
}

export async function getPaypalOrder(orderId) {
  const token = await accessToken();

  const response = await fetch(
    `${base()}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Could not retrieve PayPal order.");
  }

  return data;
}


