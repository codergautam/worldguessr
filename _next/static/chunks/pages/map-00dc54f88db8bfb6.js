(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[538],{4284:function(e,n,a){(window.__NEXT_P=window.__NEXT_P||[]).push(["/map",function(){return a(4194)}])},2642:function(e){e.exports={container:"MapPage_container__xYWXo",main:"MapPage_main__9rDnn",mapHeader:"MapPage_mapHeader__3oQ9O",mapImage:"MapPage_mapImage__enP0P",mapInfo:"MapPage_mapInfo__GI_qE",mapStats:"MapPage_mapStats__q55sE",stat:"MapPage_stat__sxArn",statIcon:"MapPage_statIcon__KuDGT",statValue:"MapPage_statValue__F1uP_",statLabel:"MapPage_statLabel__9e1yA",playButton:"MapPage_playButton__A22gH",mapDescription:"MapPage_mapDescription__ymrug",branding:"MapPage_branding__HuPlP",iframeContainer:"MapPage_iframeContainer__qN9dy",iframe:"MapPage_iframe__EmsgL",fadeOut:"MapPage_fadeOut__I3Vau",fadeIn:"MapPage_fadeIn__4GKks",backButton:"MapPage_backButton__hUtxm",mapAuthor:"MapPage_mapAuthor__oups6",statusMessage:"MapPage_statusMessage__gBAeq"}},695:function(e,n,a){"use strict";a.d(n,{Z:function(){return p}});var t=a(5893),s=a(8773),l=a(4490),o=a(1062),i=a(9222),c=a(3753);function r(e){var n,a,l,r,d,u;let{session:m,openAccountModal:p,navbarMode:h,inCrazyGames:g}=e,{t:v}=(0,i.$)("common");return!g||m&&(null==m?void 0:null===(n=m.token)||void 0===n?void 0:n.secret)?(0,t.jsx)(t.Fragment,{children:m&&(null==m?void 0:null===(a=m.token)||void 0===a?void 0:a.secret)?(0,t.jsx)("button",{className:"gameBtn ".concat(h?"navBtn":"accountBtn"," ").concat((null==m?void 0:null===(r=m.token)||void 0===r?void 0:r.supporter)?"supporterBtn":""),onClick:()=>{p()},children:(null==m?void 0:null===(d=m.token)||void 0===d?void 0:d.username)?(0,t.jsx)("p",{style:{color:"white",marginRight:"10px",marginLeft:"10px"},children:null==m?void 0:null===(u=m.token)||void 0===u?void 0:u.username}):null}):(0,t.jsx)("button",{className:"gameBtn ".concat(h?"navBtn":"accountBtn"),disabled:g,onClick:()=>{null===m&&((0,c.Z)("login_attempt"),(0,o.zB)("google"))},children:(null==m?void 0:null===(l=m.token)||void 0===l?void 0:l.secret)||null===m?(0,t.jsx)("div",{style:{marginRight:"10px",marginLeft:"10px",display:"flex",alignItems:"center",justifyContent:"center"},children:g?(0,t.jsx)(t.Fragment,{children:"..."}):(0,t.jsxs)(t.Fragment,{children:[v("login"),"\xa0\xa0",(0,t.jsx)(s.ldW,{className:"home__squarebtnicon"})]})}):"..."})}):null}var d=a(4295);function u(e){let{connected:n,shown:a}=e;return(0,t.jsx)("div",{className:"wsIcon ".concat(a?"":"hidden"),children:(0,t.jsx)(d.QbL,{size:50,style:{opacity:1,color:"white"}})})}var m=a(7294);function p(e){var n,a;let{maintenance:o,inCrazyGames:c,inGame:p,openAccountModal:h,shown:g,backBtnPressed:v,reloadBtnPressed:_,setGameOptionsModalShown:x,onNavbarPress:j,onFriendsPress:f,gameOptions:N,session:b,screen:y,multiplayerState:k,loading:w}=e,{t:P}=(0,i.$)("common"),M=((null==k?void 0:k.inGame)||"singleplayer"===y)&&!w,[C,B]=(0,m.useState)(!0);return(0,m.useEffect)(()=>{window.location.search.includes("app=true")&&B(!1)},[]),(0,t.jsx)(t.Fragment,{children:(0,t.jsxs)("div",{className:"navbar ".concat(g?"":"hidden"),children:[(0,t.jsxs)("div",{className:"nonHome ".concat("home"===y?"":"shown"),children:[(0,t.jsx)("h1",{className:"navbar__title desktop",onClick:j,children:"WorldGuessr"}),(0,t.jsx)("h1",{className:"navbar__title mobile",onClick:j,children:"WG"}),(0,t.jsx)("button",{className:"gameBtn navBtn backBtn desktop",onClick:v,children:P("back")}),(0,t.jsx)("button",{className:"gameBtn navBtn backBtn mobile",onClick:v,children:(0,t.jsx)(s.x_l,{})})]}),M&&(0,t.jsx)("button",{className:"gameBtn navBtn backBtn",style:{backgroundColor:"#000099"},onClick:_,children:(0,t.jsx)(d.O3P,{})}),(null==k?void 0:k.playerCount)&&(0,t.jsx)("span",{className:"desktop bigSpan onlineText ".concat("home"!==y?"notHome":""," ").concat("singleplayer"===y||"onboarding"===y||(null==k?void 0:k.inGame)||!(null==k?void 0:k.connected)?"hide":""),children:o?P("maintenanceMode"):P("onlineCnt",{cnt:k.playerCount})}),!(null==k?void 0:k.connected)&&(0,t.jsx)(u,{connected:!1,shown:!0}),"multiplayer"===y&&(null==k?void 0:k.inGame)&&(null==k?void 0:null===(n=k.gameData)||void 0===n?void 0:n.players.length)>0&&(0,t.jsxs)("span",{id:"playerCnt",className:"bigSpan",children:["\xa0 ",(0,t.jsx)(s.Xws,{})," ",k.gameData.players.length]}),(0,t.jsxs)("div",{className:"navbar__right",children:[(null==b?void 0:null===(a=b.token)||void 0===a?void 0:a.secret)&&(0,t.jsx)("button",{className:"gameBtn friendBtn",onClick:f,disabled:!(null==k?void 0:k.connected),children:(0,t.jsx)(s.wN,{size:40})}),"singleplayer"===y&&(0,t.jsxs)("button",{className:"gameBtn navBtn",disabled:w,onClick:()=>x(!0),children:["all"!==N.location&&N.location?(null==N?void 0:N.countryMap)?(0,l.Z)(N.location):null==N?void 0:N.communityMapName:P("allCountries"),N.nm&&N.npz?", NMPZ":N.nm?", NM":N.npz?", NPZ":""]}),!p&&C&&(0,t.jsx)(r,{inCrazyGames:c,session:b,navbarMode:!0,openAccountModal:h})]})]})})}},4490:function(e,n,a){"use strict";a.d(n,{Z:function(){return l}});var t=a(693);let s={GB:"United Kingdom",US:"United States",RU:"Russia",KR:"South Korea"};function l(e){var n;return null!==(n=s[e])&&void 0!==n?n:t.rZ(e)}},3753:function(e,n,a){"use strict";function t(e){let n=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},a=window;try{a.gtag("event",e,n)}catch(e){console.log("error sending gtag event",e)}}a.d(n,{Z:function(){return t}})},4194:function(e,n,a){"use strict";a.r(n),a.d(n,{default:function(){return u}});var t=a(5893),s=a(7294),l=a(9008),o=a(1163),i=a(2642),c=a(695),r=a(9222),d=a(5114);function u(e){var n;let{}=e,a=(0,o.useRouter)(),[u,m]=(0,s.useState)(0),[p,h]=(0,s.useState)([]),[g,v]=(0,s.useState)(i.iframe),{t:_}=(0,r.$)("common"),[x,j]=(0,s.useState)({});return(0,s.useEffect)(()=>{let{apiUrl:e}=(0,d.Z)(),n=new URLSearchParams(window.location.search),t=a.query.s||a.query.slug||n.get("s")||n.get("slug");t&&(console.log("fetching map data for",t),fetch(e+"/api/map/publicData?slug=".concat(t)).then(async e=>{if(e.ok){let n=await e.json();console.log("fetched map data:",n),j(n.mapData)}else console.error("Failed to fetch map data:",e),404===e.status&&a.push("/404")}))},[]),(0,s.useEffect)(()=>{if(!x.data)return;let e=x.data.map(e=>"//www.google.com/maps/embed/v1/streetview?key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&location=".concat(e.lat,",").concat(e.lng,"&fov=60"));h(e);let n=setInterval(()=>{v(i.iframe+" "+i.fadeOut),setTimeout(()=>{m(Math.floor(Math.random()*e.length)),v(i.iframe+" "+i.fadeIn)},1e3)},5e3);return()=>clearInterval(n)},[x.data]),(0,t.jsxs)("div",{className:i.container,children:[(0,t.jsxs)(l,{children:[(0,t.jsx)("title",{children:(null==x?void 0:x.name)+" - Play Free on WorldGuessr"}),(0,t.jsx)("meta",{name:"description",content:"Explore ".concat(null==x?void 0:x.name," on WorldGuessr, a free GeoGuessr clone. ").concat(null==x?void 0:x.description_short)}),(0,t.jsx)("link",{rel:"icon",type:"image/x-icon",href:"/icon.ico"})]}),(0,t.jsx)("style",{children:"\n          .mainBody {\n            user-select: auto !important;\n            overflow: auto !important;\n          }\n        "}),(0,t.jsxs)("main",{className:i.main,children:[(0,t.jsx)(c.Z,{}),(null==x?void 0:x.name)&&(0,t.jsxs)(t.Fragment,{children:[x.in_review&&(0,t.jsx)("div",{className:i.statusMessage,children:(0,t.jsx)("p",{children:"⏳ This map is currently under review."})}),x.reject_reason&&(0,t.jsx)("div",{className:i.statusMessage,children:(0,t.jsxs)("p",{children:["❌ This map has been rejected: ",x.reject_reason]})})]}),(0,t.jsxs)("div",{className:i.branding,children:[(0,t.jsx)("h1",{children:"WorldGuessr"}),(0,t.jsx)("center",{children:(0,t.jsxs)("button",{onClick:()=>window.location.href="/",className:i.backButton,children:["← ",_("backToGame")]})})]}),!x.name&&(0,t.jsx)("div",{className:i.statusMessage,style:{backgroundColor:"green",color:"white"},children:(0,t.jsx)("center",{children:(0,t.jsx)("p",{children:"Loading map..."})})}),x.name&&(0,t.jsxs)("div",{className:i.mapHeader,children:[(0,t.jsxs)("div",{className:i.mapImage,children:[p.length>0&&(0,t.jsx)("div",{className:i.iframeContainer,children:(0,t.jsx)("iframe",{className:g,loading:"lazy",allowFullScreen:!0,referrerPolicy:"no-referrer-when-downgrade",src:p[u]})}),x.countryCode&&(0,t.jsx)("img",{src:"https://flagcdn.com/w2560/".concat(null===(n=x.countryCode)||void 0===n?void 0:n.toLowerCase(),".png"),style:{width:"100%",height:"100%",objectFit:"cover"}})]}),(0,t.jsxs)("div",{className:i.mapInfo,children:[(0,t.jsx)("h1",{children:x.name}),(0,t.jsx)("p",{children:x.description_short})]})]}),(null==x?void 0:x.name)&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("button",{className:i.playButton,onClick:()=>{window.location.href="/?map=".concat(x.countryCode||x.slug)},children:"PLAY"}),(0,t.jsxs)("div",{className:i.mapStats,children:[void 0!==x.plays&&(0,t.jsxs)("div",{className:i.stat,children:[(0,t.jsx)("span",{className:i.statIcon,children:"\uD83D\uDC65"}),(0,t.jsx)("span",{className:i.statValue,children:x.plays.toLocaleString()}),(0,t.jsx)("span",{className:i.statLabel,children:"Plays"})]}),void 0!==x.hearts&&(0,t.jsxs)("div",{className:i.stat,children:[(0,t.jsx)("span",{className:i.statIcon,children:"❤️"}),(0,t.jsx)("span",{className:i.statValue,children:x.hearts.toLocaleString()}),(0,t.jsx)("span",{className:i.statLabel,children:"Hearts"})]})]}),(0,t.jsxs)("div",{className:i.mapDescription,children:[(0,t.jsx)("h2",{children:"About this map"}),x.description_long.split("\n").map((e,n)=>(0,t.jsx)("p",{children:e},n)),(0,t.jsxs)("p",{className:i.mapAuthor,children:["Created by ",(0,t.jsx)("strong",{children:x.created_by}),x.created_at&&" ".concat(x.created_at," ago")]})]})]})]})]})}}},function(e){e.O(0,[396,365,997,693,132,888,774,179],function(){return e(e.s=4284)}),_N_E=e.O()}]);