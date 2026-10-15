/* Picalta 5 — demonstração isolada. Não comunica com o Firebase real. */
'use strict';
function initDemo() {
  window.PICALTA_DEMO = true;
  const mem = new Map(), listeners = new Set();
  const now = Date.now();
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const stamp = () => Date.now();
  const put = (path, data) => mem.set(path, clone(data));
  const users = [
    ['demo-me','Visitante Picalta','visitante','#672ea4','Fotografias, pequenas descobertas e tudo o que fica entre os dois.'],
    ['ines','Inês Martins','ines.martins','#b26e59','Coleciono luz e dias junto ao mar.'],
    ['tomas','Tomás Costa','tomas.costa','#59756a','Sempre a caminho do próximo trilho.'],
    ['sofia','Sofia Almeida','sofia.almeida','#b58b49','As coisas simples são as minhas favoritas.'],
    ['miguel','Miguel Rocha','miguel.rocha','#576c95','Lisboa pela lente de uma máquina analógica.'],
    ['lara','Lara Santos','lara.santos','#9b6887','Música, fotografia e projetos sem pressa.'],
    ['diogo','Diogo Ferreira','diogo.ferreira','#65818e','O mar é a minha segunda casa.'],
  ];
  for (const [uid,name,username,avatarColor,bio] of users) put('users/'+uid,{uid,name,username,avatarColor,bio,email:uid==='demo-me'?'demo@picalta.local':'',lastSeen:now-(uid==='tomas'?500000:60000),createdAt:now-86400000});
  const posts = [
    ['post-mar','ines','demo/p1.jpg','Há lugares que nos fazem esquecer as horas. Hoje fiquei por aqui.','Costa Vicentina',['#portugal','#natureza'],['tomas','sofia','miguel','lara','diogo']],
    ['post-cafe','sofia','demo/p2.jpg','Domingos deviam durar mais. Café quente, flores frescas e nenhum plano.','Lisboa',['#slowmornings','#fotografia'],['ines','tomas','lara']],
    ['post-lisboa','miguel','demo/p3.jpg','A minha cidade tem sempre mais uma história para contar.','Alfama, Lisboa',['#lisboa','#analogico'],['ines','tomas','diogo','sofia']],
    ['post-trilho','tomas','demo/p4.jpg','O melhor caminho é quase sempre o mais longo.','Lago di Como',['#aventura','#natureza'],['ines','miguel']],
    ['post-onda','diogo','demo/p5.jpg','Só mais uma onda antes de voltar.','Ericeira',['#surf','#oceano'],['ines','tomas','lara']],
    ['post-musica','lara','demo/p6.jpg','A banda sonora certa muda tudo. O que andam a ouvir?','Porto',['#musica','#criatividade'],['ines','sofia']],
    ['post-me','demo-me','demo/p3.jpg','Guardar os pequenos detalhes. É por isso que gosto de fotografar.','Lisboa',['#momentos','#fotografia'],['ines','sofia','miguel']],
  ];
  posts.forEach((p,i)=>put('posts/'+p[0],{uid:p[1],imageUrl:p[2],images:p[0]==='post-mar'?[{url:p[2],alt:'Falésias portuguesas ao fim do dia'},{url:'demo/p5.jpg',alt:'Mar azul visto de cima'},{url:'demo/p4.jpg',alt:'Caminho junto a um lago'}]:[{url:p[2],alt:p[3]}],caption:p[3],location:p[4],hashtags:p[5],likes:p[6],createdAt:now-(i+1)*45*60000}));
  [['reel-1','diogo','Só mais uma onda antes de voltar. O mar de hoje merecia ser filmado.',['#surf','#oceano','#ericeira'],['ines','tomas','lara'],20],
   ['reel-2','miguel','Lisboa em três atos: luz, azulejo e o elétrico das seis. #lisboa #cidade',['#lisboa','#cidade'],['ines','sofia','diogo','tomas'],35],
   ['reel-3','ines','Pequenos rituais de domingo: café quente, janela aberta e nenhum plano.',['#slowmornings','#domingo'],['sofia','lara'],55],
   ['reel-4','tomas','O trilho que me trouxe até aqui, em onze segundos.',['#aventura','#natureza'],['ines','miguel','diogo'],80],
   ['reel-5','lara','Bastidores de um dia criativo. O que andam a ouvir por aí?',['#musica','#criatividade'],['sofia'],110]].forEach((r,i)=>put('posts/'+r[0],{uid:r[1],type:'reel',videoUrl:'demo/reel'+(i+1)+'.mp4',imageUrl:'demo/reel'+(i+1)+'.jpg',posterUrl:'demo/reel'+(i+1)+'.jpg',images:[],caption:r[2],text:'',location:'',hashtags:r[3],likes:r[4],duration:11,aspect:0.5625,createdAt:now-r[5]*60000}));
  put('posts/reel-1/comments/rc1',{uid:'ines',text:'Que mar. Obrigada por partilhares.',likes:[],replyTo:null,createdAt:now-900000});
  put('posts/reel-2/comments/rc1',{uid:'sofia',text:'Alfama ao fim do dia é tudo.',likes:['miguel'],replyTo:null,createdAt:now-800000});
  put('posts/post-mar/comments/c1',{uid:'sofia',text:'Que luz incrível. Preciso de ir aí um dia destes.',likes:['tomas'],replyTo:null,createdAt:now-200000});
  put('posts/post-mar/comments/c2',{uid:'ines',text:'Ao fim da tarde fica ainda mais bonito.',likes:[],replyTo:'c1',createdAt:now-150000});
  put('posts/post-mar/comments/c3',{uid:'tomas',text:'O sítio perfeito para desligar um bocadinho.',likes:[],replyTo:null,createdAt:now-100000});
  ['ines','tomas','sofia','miguel','lara','diogo'].forEach((uid,i)=>{
    put('stories/story-'+uid,{uid,imageUrl:'demo/s'+(i+1)+'.jpg',caption:['Um bocadinho de mar','Pausa para respirar','Luz bonita por aqui','Pelo caminho','Dias assim','No meu canto'][i],createdAt:now-(i+1)*30*60000});
    if(i<3) put('follows/demo-me_'+uid,{follower:'demo-me',following:uid,createdAt:now-86400000});
    if(i<4) put('follows/'+uid+'_demo-me',{follower:uid,following:'demo-me',createdAt:now-86400000});
  });
  put('stories/story-ines-2',{uid:'ines',imageUrl:'demo/s5.jpg',caption:'Ainda não me fui embora.',createdAt:now-600000});
  put('players/demo-me',{uid:'demo-me',xp:180,level:3,achievements:['first_post','first_story','first_follow']});
  put('users/demo-me/picaltaData/collections',{items:[{id:'c-viagem',name:'Lugares para ir',postIds:['post-mar','post-trilho']},{id:'c-inspiracao',name:'Pequenas inspirações',postIds:['post-cafe']}]});
  put('favorites/demo-me_post-mar',{uid:'demo-me',postId:'post-mar',createdAt:now-50000});
  put('favorites/demo-me_post-cafe',{uid:'demo-me',postId:'post-cafe',createdAt:now-50000});
  put('events/event-fotopasseio',{uid:'miguel',title:'Lisboa pela tua lente',description:'Um passeio sem pressa por Alfama. Traz a tua máquina ou o telemóvel e vontade de descobrir novos ângulos.',location:'Miradouro das Portas do Sol, Lisboa',startsAt:now+2*86400000,cover:'demo/c3.jpg',createdAt:now-100000});
  put('events/event-mar',{uid:'ines',title:'Encontro ao pôr do sol',description:'Fotografia, mar e boa companhia. Encontramo-nos no areal e ficamos até a luz desaparecer.',location:'Praia do Guincho, Cascais',startsAt:now+4*86400000,cover:'demo/c1.jpg',createdAt:now-200000});
  for (const u of ['ines','tomas','sofia']) put('events/event-fotopasseio/attendees/'+u,{uid:u,status:'going',createdAt:now});
  put('chats/chat-ines',{participants:['demo-me','ines'],createdAt:now-86400000});
  put('chats/chat-ines/messages/m1',{uid:'ines',text:'Já viste a luz que está hoje junto ao rio?',createdAt:now-120000});
  put('chats/chat-ines/messages/m2',{uid:'demo-me',text:'Está mesmo bonita. Vou levar a máquina.',createdAt:now-60000});
  put('chats/chat-tomas',{participants:['demo-me','tomas'],createdAt:now-86400000});
  put('chats/chat-tomas/messages/m1',{uid:'tomas',text:'Combinamos o próximo passeio por aqui?',createdAt:now-3600000});
  put('groups/g-foto',{owner:'miguel',name:'Olhares de Lisboa',description:'A cidade vista por quem a vive. Partilha os teus lugares favoritos.',createdAt:now-86400000});
  put('groups/g-foto/members/miguel',{uid:'miguel',username:'miguel.rocha',role:'admin',joinedAt:now});
  put('groups/g-foto/members/demo-me',{uid:'demo-me',username:'teu.perfil',role:'member',joinedAt:now});
  put('groups/g-foto/posts/gp1',{uid:'miguel',text:'Bem-vindos. Qual é o vosso miradouro favorito?',createdAt:now-100000});
  put('groups/g-cria',{owner:'lara',name:'Clube criativo',description:'Ideias, processos e projetos em boa companhia.',createdAt:now-50000});
  put('polls/p-fimdesemana',{uid:'ines',question:'O próximo passeio vai ser…',options:[{text:'À beira-mar',votes:[]},{text:'Pelas ruas da cidade',votes:[]},{text:'No meio da natureza',votes:[]}],createdAt:now-50000});
  for(const [uid,idx] of [['ines',0],['tomas',2],['sofia',0],['miguel',1]]) put('polls/p-fimdesemana/votes/'+uid,{uid,optionIdx:idx,createdAt:now});
  put('songs/song1',{uid:'lara',title:'Lo-fi para criar',videoId:'jfKfPfyJRdk',createdAt:now-50000});
  const ref = (...args) => {
    let parts=args.filter(x=>x!==db&&typeof x!=='undefined').map(x=>typeof x==='object'?x.path:x).filter(Boolean);
    return {path:parts.join('/')};
  };
  const docSnap = path => ({id:path.split('/').pop(),exists:()=>mem.has(path),data:()=>clone(mem.get(path))});
  function snapshot(q){
    if(q.path.split('/').length%2===0&&!q.constraints) return docSnap(q.path);
    let rows=[...mem.keys()].filter(k=>k.startsWith(q.path+'/')&&k.split('/').length===q.path.split('/').length+1).map(docSnap);
    for(const c of q.constraints||[]){
      if(c.kind==='where') rows=rows.filter(d=>{const v=c.field==='__name__'?d.id:d.data()[c.field];return c.op==='=='?v===c.value:c.op==='array-contains'?Array.isArray(v)&&v.includes(c.value):c.op==='in'?c.value.includes(v):c.op==='>='?v>=c.value:c.op==='<='?v<=c.value:true;});
      if(c.kind==='order') rows.sort((a,b)=>{let av=a.data()[c.field]||0,bv=b.data()[c.field]||0;return (av>bv?1:av<bv?-1:0)*(c.dir==='desc'?-1:1);});
      if(c.kind==='limit')rows=rows.slice(0,c.n);
    }
    return {docs:rows,size:rows.length,empty:!rows.length,forEach:fn=>rows.forEach(fn),docChanges:()=>[]};
  }
  let notifyTimer;
  const notify=()=>{clearTimeout(notifyTimer);notifyTimer=setTimeout(()=>listeners.forEach(l=>{try{l.cb(snapshot(l.q));}catch(e){l.err?.(e);console.error(e);}}),0);};
  function patch(path,data,merge){
    const old=mem.get(path)||{},next=merge?{...old}:{};
    for(const [k,v] of Object.entries(data)){
      const path=k.split('.'),last=path.pop();let tgt=next;
      for(const seg of path){tgt[seg]=tgt[seg]&&typeof tgt[seg]==='object'?{...tgt[seg]}:{};tgt=tgt[seg];}
      if(v?.__op==='union')tgt[last]=[...new Set([...(tgt[last]||[]),...v.values])];
      else if(v?.__op==='remove')tgt[last]=(tgt[last]||[]).filter(x=>!v.values.includes(x));
      else if(v?.__op==='increment')tgt[last]=(tgt[last]||0)+v.value;
      else if(v?.__op==='delete')delete tgt[last];
      else tgt[last]=v;
    }
    put(path,next);notify();
  }
  db={demo:true};
  __fsFns={doc:ref,collection:ref,query:(r,...constraints)=>({...r,constraints}),where:(field,op,value)=>({kind:'where',field,op,value}),orderBy:(field,dir)=>({kind:'order',field,dir}),limit:n=>({kind:'limit',n}),documentId:()=>'__name__',serverTimestamp:stamp,
    getDoc:async r=>docSnap(r.path),getDocs:async q=>snapshot(q),
    setDoc:async(r,d,o)=>patch(r.path,d,o?.merge),updateDoc:async(r,d)=>patch(r.path,d,true),
    addDoc:async(r,d)=>{const id='d'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);patch(r.path+'/'+id,d,false);return {id,path:r.path+'/'+id};},
    deleteDoc:async r=>{mem.delete(r.path);notify();},
    onSnapshot:(q,cb,err)=>{const l={q,cb,err};listeners.add(l);queueMicrotask(()=>{if(listeners.has(l))try{cb(snapshot(q));}catch(e){err?.(e);console.error(e);}});return ()=>listeners.delete(l);},
    arrayUnion:(...values)=>({__op:'union',values}),arrayRemove:(...values)=>({__op:'remove',values}),increment:value=>({__op:'increment',value}),deleteField:()=>({__op:'delete'}),
    runTransaction:async(_,fn)=>fn({get:async r=>docSnap(r.path),set:(r,d,o)=>patch(r.path,d,o?.merge),update:(r,d)=>patch(r.path,d,true),delete:r=>{mem.delete(r.path);notify();}}),
  };
  const user={uid:'demo-me',email:'demo@picalta.local',displayName:'O teu perfil',getIdToken:async()=>''};
  auth={currentUser:user};
  __authFns={getRedirectResult:async()=>null,getIdToken:async()=>'',signOut:async()=>{},sendPasswordResetEmail:async()=>{throw new Error('A demonstração não envia emails.');}};
  window.DEMO_DB={mem,listeners};
  return Promise.resolve({auth,db,onAuthStateChanged:(_,cb)=>{
    const start=()=>setTimeout(()=>cb(user),0);
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
    return ()=>{};
  }});
}
