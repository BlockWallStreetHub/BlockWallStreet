/* Sends every site form to the BWS Worker first, then Web3Forms as a backup,
   so a Web3Forms free-plan limit never blocks a customer. */
(function(){
'use strict';
var W='https://dd-sync.blockwallstreet638.workers.dev/rsvp',WF='api.web3forms.com';
var SKIP={access_key:1,botcheck:1,redirect:1,from_name:1,subject:1,name:1,email:1,phone:1};
function pack(d){
  var lines=[];
  Object.keys(d).forEach(function(k){if(!SKIP[k]&&d[k]!==''&&d[k]!=null)lines.push(k.replace(/_/g,' ')+': '+d[k])});
  var email=String(d.email||'').trim();
  return {form:String(d.subject||'Website form'),name:String(d.name||email),email:email,phone:String(d.phone||''),message:lines.join('\n')};
}
function toWorker(d){
  if(d.botcheck)return Promise.resolve({ok:true,mailed:true});
  var ctl=typeof AbortController==='function'?new AbortController():null,t=ctl&&setTimeout(function(){ctl.abort()},9000);
  return origFetch(W,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pack(d)),signal:ctl?ctl.signal:undefined})
    .then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{ok:!!(r.ok&&j&&j.ok),mailed:!!(j&&j.mailed)}})})
    .catch(function(){return{ok:false,mailed:false}})
    .then(function(x){if(t)clearTimeout(t);return x});
}
var origFetch=window.fetch.bind(window);
/* forms that post with fetch (class RSVP) */
window.fetch=function(u,opts){
  try{
    if(typeof u==='string'&&u.indexOf(WF)>-1&&opts&&typeof opts.body==='string'){
      var d=JSON.parse(opts.body);
      return toWorker(d).then(function(x){
        var ok=function(){return new Response(JSON.stringify({success:true}),{status:200,headers:{'Content-Type':'application/json'}})};
        if(x.ok&&x.mailed)return ok();
        return origFetch(u,opts).then(function(r){return r.clone().json().then(function(j){return(j&&j.success)||!x.ok?r:ok()},function(){return x.ok?ok():r})},function(e){if(x.ok)return ok();throw e});
      });
    }
  }catch(e){}
  return origFetch(u,opts);
};
/* plain HTML forms (confirmation, newsletter, contact) */
window.addEventListener('submit',function(ev){
  var f=ev.target;
  if(!f||f.tagName!=='FORM'||f.__relayed||f.hasAttribute('data-rsvp-form'))return;
  if(String(f.getAttribute('action')||'').indexOf(WF)<0)return;
  if(typeof f.checkValidity==='function'&&!f.checkValidity())return;
  ev.preventDefault();ev.stopPropagation();
  var b=f.querySelector('button[type=submit],input[type=submit]'),old=b&&(b.textContent||b.value);
  if(b){b.disabled=true;if(b.textContent!=null)b.textContent='Sending...'}
  var d={};new FormData(f).forEach(function(v,k){d[k]=v});
  var red=d.redirect;
  function done(){
    if(red){location.href=red;return}
    var m=document.createElement('div');m.className='card';m.setAttribute('role','status');m.style.cssText='padding:20px;border:1px solid rgba(255,255,255,.18);border-radius:14px;';
    m.innerHTML='<strong>Thank you. We got it.</strong><p style="margin:8px 0 0">We will email you shortly. If you do not hear from us within a day, check your spam folder or message us.</p>';
    f.replaceWith(m);
  }
  function native(){f.__relayed=1;if(b){b.disabled=false;if(old!=null&&b.textContent!=null)b.textContent=old}f.submit()}
  toWorker(d).then(function(x){
    if(x.ok&&x.mailed)return done();
    /* saved but no email went out (daily cap): also try Web3Forms, but do not fail the customer */
    if(x.ok){origFetch('https://'+WF+'/submit',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(d)}).catch(function(){});return done()}
    native();
  });
},true);
})();
