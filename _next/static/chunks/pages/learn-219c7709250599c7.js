(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[128],{2036:function(e,t,o){(window.__NEXT_P=window.__NEXT_P||[]).push(["/learn",function(){return o(3219)}])},4731:function(e){e.exports={style:{fontFamily:"'__Jockey_One_a2b6c6', '__Jockey_One_Fallback_a2b6c6'",fontWeight:400,fontStyle:"normal"},className:"__className_a2b6c6"}},6540:function(e){e.exports={style:{fontFamily:"'__Roboto_33b368', '__Roboto_Fallback_33b368'",fontWeight:400,fontStyle:"normal"},className:"__className_33b368"}},9008:function(e,t,o){e.exports=o(7828)},5114:function(e,t,o){"use strict";o.d(t,{Z:function(){return s}});var n=o(3454);function s(){var e,t;let o=!window||"https:"===window.location.protocol;return{apiUrl:(o?"https":"http")+"://server.worldguessr.com",websocketUrl:(o?"wss":"ws")+"://"+(null!==(t=null!==(e=n.env.NEXT_PUBLIC_WS_HOST)&&void 0!==e?e:"server.worldguessr.com")&&void 0!==t?t:"localhost:3001")+"/wg"}}},3219:function(e,t,o){"use strict";o.r(t),o.d(t,{default:function(){return u}});var n=o(5893),s=o(4731),i=o(6540),a=o(7294),l=o(5675);o(1664);var r=o(9008),c=o(5114);function u(e){let{locale:t}=e,[o,u]=a.useState(0),[d,h]=a.useState(0);return a.useEffect(()=>{fetch((0,c.Z)().apiUrl+"/api/clues/getCluesCount").then(e=>e.json()).then(e=>{u(e.count)})},[]),a.useEffect(()=>{let e=setInterval(()=>{h(.85*d+.15*o)},20);return()=>clearInterval(e)}),(0,n.jsxs)(n.Fragment,{children:[(0,n.jsxs)(r,{children:[(0,n.jsx)("title",{children:"WorldGuessr - Learn Mode"}),(0,n.jsx)("meta",{name:"description",content:"Learn Mode - Improve your Geoguessr skills by guessing & learning with community explanations of strategies you could've used to pinpoint each location."}),(0,n.jsx)("meta",{name:"viewport",content:"width=device-width, initial-scale=1.0"}),(0,n.jsx)("meta",{name:"theme-color",content:"#000000"}),(0,n.jsx)("meta",{name:"robots",content:"index, follow"})]}),(0,n.jsx)("div",{style:{top:0,left:0,position:"fixed",width:"100vw",height:"100vh",transition:"opacity 0.5s",opacity:.4,userSelect:"none"},children:(0,n.jsx)(l.default,{src:"/street1.jpg",fill:!0,alt:"Game Background",style:{objectFit:"cover",userSelect:"none"},sizes:"(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"})}),(0,n.jsx)("main",{className:"home ".concat(s.className," ").concat(i.className),id:"main",children:(0,n.jsx)("div",{className:"home__content",children:(0,n.jsxs)("div",{className:"home__ui",style:{backgroundColor:"rgba(0,0,0,0.5)",padding:"20px",borderRadius:"10px"},children:[(0,n.jsx)("h1",{className:"home__title",children:"WorldGuessr"}),(0,n.jsxs)("h2",{className:"home__subtitle",children:["Learn Mode ",(0,n.jsx)("span",{className:"home__subtitle--highlight",style:{color:"orange"},children:"(Beta)"})]}),(0,n.jsx)("p",{className:"home__subtitle",style:{fontSize:"1.5em",color:"white",textShadow:"none"},children:"Inspired by a Reddit post - Improve your Geoguessr skills by guessing & learning with community explanations of strategies you could've used to pinpoint each location."}),(0,n.jsxs)("p",{className:"home__subtitle",style:{fontSize:"1.5em",color:"white",textShadow:"none"},children:[Math.round(d)," explanations contributed!",(0,n.jsx)("br",{}),(0,n.jsx)("a",{style:{color:"cyan"},target:"_blank",href:"https://discord.com/invite/ubdJHjKtrC",children:"Join our Discord"})," to become a contributor!"]}),(0,n.jsx)("button",{className:"gameBtn",onClick:()=>{window.location.href="/?learn=true"},children:"Play!"})]})})})]})}}},function(e){e.O(0,[664,675,888,774,179],function(){return e(e.s=2036)}),_N_E=e.O()}]);