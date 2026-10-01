const prisma = require('../db');

async function sendPushToUser(userId, title, body, data={}) {
  const tokens = await prisma.pushToken.findMany({where:{userId,active:true}});
  // Delivery provider is intentionally isolated. Set FCM_PROVIDER=custom and implement
  // the provider with Firebase Admin credentials in production. The app still stores
  // tokens and in-app notifications even when push is not configured.
  if (!process.env.FCM_PROJECT_ID || !process.env.FCM_CLIENT_EMAIL || !process.env.FCM_PRIVATE_KEY) {
    return {sent:0, queued:tokens.length, configured:false};
  }
  try {
    const {GoogleAuth}=require('google-auth-library');
    const auth=new GoogleAuth({credentials:{client_email:process.env.FCM_CLIENT_EMAIL,private_key:process.env.FCM_PRIVATE_KEY.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/firebase.messaging']});
    const client=await auth.getClient(); const access=await client.getAccessToken();
    let sent=0;
    for(const t of tokens){
      const r=await fetch(`https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${access.token}`, 'Content-Type':'application/json'},body:JSON.stringify({message:{token:t.token,notification:{title,body},data:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,String(v)])),webpush:{fcm_options:{link:`${process.env.APP_URL||''}/minha-conta.html`}}}})});
      if(r.ok) sent++; else if(r.status===404||r.status===400) await prisma.pushToken.update({where:{id:t.id},data:{active:false}});
    }
    return {sent,configured:true};
  } catch(e){ return {sent:0,configured:true,error:e.message}; }
}
module.exports={sendPushToUser};
