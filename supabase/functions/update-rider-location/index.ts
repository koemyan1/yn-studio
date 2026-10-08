import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type"};
Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  try{
    const u=new URL(req.url); const orderId=u.searchParams.get('order_id'); const token=u.searchParams.get('token');
    if(!orderId||!token) return new Response('Missing tracking credentials',{status:400,headers:cors});
    const body=await req.json(); const lat=Number(body.latitude), lng=Number(body.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)) return new Response('Invalid location',{status:400,headers:cors});
    const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const {data,error}=await supabase.from('orders').update({rider_lat:lat,rider_lng:lng,tracking_updated_at:new Date().toISOString()}).eq('id',orderId).eq('tracking_token',token).eq('tracking_active',true).select('id').maybeSingle();
    if(error) throw error;
    if(!data) return new Response('Tracking session is no longer active',{status:403,headers:cors});
    return new Response(JSON.stringify({ok:true}),{headers:{...cors,'content-type':'application/json'}});
  }catch(e){return new Response(JSON.stringify({error:String(e)}),{status:500,headers:{...cors,'content-type':'application/json'}})}
});
