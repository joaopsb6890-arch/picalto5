/* Picalta 5 — camada de dados retrocompatível, Firestore real ou demonstração. */
'use strict';
const V5DATA = {
  ref(key) { return __fsFns.doc(db,'users',state.me.uid,'picaltaData',key); },
  async get(key, fallback) { const s=await __fsFns.getDoc(this.ref(key));return s.exists()?s.data():fallback; },
  async set(key, data) { await __fsFns.setDoc(this.ref(key),data,{merge:true}); },
  watch(key, cb, error) { return __fsFns.onSnapshot(this.ref(key),s=>cb(s.exists()?s.data():null),error); },
  privateCollection(name) { return __fsFns.collection(db,'users',state.me.uid,name); },
  async createPost(post, id) {
    const {collection,addDoc,doc,setDoc,serverTimestamp}=__fsFns;
    const data={...post,uid:state.me.uid,likes:[],createdAt:serverTimestamp()};
    if(id){await setDoc(doc(db,'posts',id),data);return {id};}
    return addDoc(collection(db,'posts'),data);
  },
  async upload(dataUrl, folder) {
    if(window.PICALTA_DEMO) return dataUrl;
    const blob=await (await fetch(dataUrl)).blob();
    return cdnUploadImage(state.me.uid,new File([blob],'picalta-'+Date.now()+'.jpg',{type:blob.type||'image/jpeg'}),'picalta/'+(folder||'posts'));
  },
  async draftSave(id, data) {
    if(new Blob([JSON.stringify(data)]).size>800000)throw new Error('O rascunho é demasiado grande. Remove uma fotografia e tenta novamente.');
    await __fsFns.setDoc(__fsFns.doc(db,'users',state.me.uid,'drafts',id),{...data,updatedAt:Date.now()});
  },
  async draftDelete(id){await __fsFns.deleteDoc(__fsFns.doc(db,'users',state.me.uid,'drafts',id));},
  watchDrafts(cb,error){return __fsFns.onSnapshot(__fsFns.query(this.privateCollection('drafts'),__fsFns.orderBy('updatedAt','desc')),s=>cb(s.docs.map(d=>({id:d.id,...d.data()}))),error);},
  async schedule(post,dueAt){
    if(!Number.isFinite(dueAt)||dueAt<Date.now()+60000)throw new Error('Escolhe uma data pelo menos um minuto no futuro.');
    return __fsFns.addDoc(this.privateCollection('scheduled'),{post,dueAt,status:'pending',createdAt:Date.now()});
  },
  watchScheduled(cb,error){return __fsFns.onSnapshot(this.privateCollection('scheduled'),s=>cb(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.dueAt-b.dueAt)),error);},
  async cancelScheduled(id){await __fsFns.deleteDoc(__fsFns.doc(db,'users',state.me.uid,'scheduled',id));},
  async publishScheduled(id){
    const {doc,runTransaction,serverTimestamp}=__fsFns;
    return runTransaction(db,async tx=>{
      const r=doc(db,'users',state.me.uid,'scheduled',id),s=await tx.get(r);
      if(!s.exists()||s.data().status!=='pending'||s.data().dueAt>Date.now())return false;
      tx.set(doc(db,'posts','scheduled_'+state.me.uid+'_'+id),{...s.data().post,uid:state.me.uid,likes:[],createdAt:serverTimestamp()});
      tx.delete(r);return true;
    });
  },
  async comment(postId,text,replyTo){
    const t=String(text||'').trim();if(!t||t.length>2000)throw new Error('Escreve entre 1 e 2000 caracteres.');
    return __fsFns.addDoc(__fsFns.collection(db,'posts',postId,'comments'),{uid:state.me.uid,text:t,replyTo:replyTo||null,likes:[],createdAt:__fsFns.serverTimestamp()});
  },
  async commentLike(postId,comment){await __fsFns.updateDoc(__fsFns.doc(db,'posts',postId,'comments',comment.id),{likes:(comment.likes||[]).includes(state.me.uid)?__fsFns.arrayRemove(state.me.uid):__fsFns.arrayUnion(state.me.uid)});},
  async commentEdit(postId,id,text){if(!text.trim()||text.length>2000)throw new Error('O comentário deve ter entre 1 e 2000 caracteres.');await __fsFns.updateDoc(__fsFns.doc(db,'posts',postId,'comments',id),{text:text.trim(),editedAt:Date.now()});},
  async commentDelete(postId,id){await __fsFns.deleteDoc(__fsFns.doc(db,'posts',postId,'comments',id));},
  async story(data){return __fsFns.addDoc(__fsFns.collection(db,'stories'),{...data,uid:state.me.uid,createdAt:__fsFns.serverTimestamp()});},
  async storyReact(id,reaction){await __fsFns.setDoc(__fsFns.doc(db,'stories',id,'reactions',state.me.uid),{uid:state.me.uid,reaction,createdAt:__fsFns.serverTimestamp()});},
  async storyDelete(id){await __fsFns.deleteDoc(__fsFns.doc(db,'stories',id));},
  watchEvents(cb,error){return __fsFns.onSnapshot(__fsFns.query(__fsFns.collection(db,'events'),__fsFns.orderBy('startsAt','asc'),__fsFns.limit(50)),s=>cb(s.docs.map(d=>({id:d.id,...d.data()}))),error);},
  async eventCreate(data){if(!data.title.trim()||data.title.length>100||!data.location.trim()||!Number.isFinite(data.startsAt)||data.startsAt<Date.now())throw new Error('Preenche o título, o local e uma data futura.');return __fsFns.addDoc(__fsFns.collection(db,'events'),{...data,uid:state.me.uid,createdAt:__fsFns.serverTimestamp()});},
  watchAttendees(id,cb,error){return __fsFns.onSnapshot(__fsFns.collection(db,'events',id,'attendees'),s=>cb(s.docs.map(d=>({id:d.id,...d.data()}))),error);},
  async eventRSVP(id,going){const r=__fsFns.doc(db,'events',id,'attendees',state.me.uid);if(going)await __fsFns.setDoc(r,{uid:state.me.uid,status:'going',createdAt:Date.now()});else await __fsFns.deleteDoc(r);},
  async report(post,reason){return __fsFns.addDoc(__fsFns.collection(db,'reports'),{uid:state.me.uid,postId:post.id,targetUid:post.uid,reason,createdAt:__fsFns.serverTimestamp()});},
  async claimChallenge(key,reward,date){
    const {runTransaction,doc}=__fsFns;
    return runTransaction(db,async tx=>{
      const r=this.ref('challenges'),p=doc(db,'players',state.me.uid),s=await tx.get(r),ps=await tx.get(p);
      const d=s.exists()?s.data():{date,counts:{},claimed:[]};
      if(d.date!==date||(d.claimed||[]).includes(key))return false;
      const ch=window.PICALTA_V5.challengeDefs.find(x=>x.id===key);
      if(!ch||(d.counts?.[key]||0)<ch.target)return false;
      const xp=(ps.exists()?ps.data().xp||0:0)+reward;
      tx.set(r,{...d,claimed:[...(d.claimed||[]),key]});
      tx.set(p,{uid:state.me.uid,xp,level:levelForXp(xp),achievements:ps.exists()?ps.data().achievements||[]:[]},{merge:true});
      return true;
    });
  }
};
