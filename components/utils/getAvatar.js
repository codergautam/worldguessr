const avatars=[
    "/avatars/1.png",
    "/avatars/2.png",
    "/avatars/3.png",
    "/avatars/4.png",
    "/avatars/5.png",
    "/avatars/6.png",
    "/avatars/7.png",
    "/avatars/8.png",
    "/avatars/9.png",
    "/avatars/10.png",
    "/avatars/11.png",
]


export default function getAvatar(){
       const length= avatars.length;
       // randomNumber = Math.floor(Math.random()*(b-a+1)+ a)
       const randomIndex=Math.floor(Math.random()*((length-1)-0+1)+0);

       return avatars[randomIndex];
}