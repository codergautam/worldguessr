import { useEffect, useRef, useState } from "react"
import getAvatar from "../utils/getAvatar"

export default function HomeContent() {
    const [avatarPath, setAvatarPath] = useState("")
    const inputRef = useRef();
    const [selectDropdown, setSelectDropdown] = useState(false)
    // ref for the dropdown of the buttons
    const optionsRef=useRef();

    useEffect(() => {
        inputRef.current.focus();

        const path = getAvatar();
        setAvatarPath(path);

        setTimeout(() => {
            setAvatarPath(getAvatar())
        }, 15000);
    }, [])

    return (
        <>
            <div className=" flex flex-col relative bottom-10">
                <div className="heading text-center flex flex-col  gap-5 items-center">
                    <h1 className="text-7xl font-extrabold ">WorldGuessr</h1>
                    <h3 className="text-xl underline font-bold">A free multiplayer geography guessing game !!</h3>
                    <img src={avatarPath} className="w-20 h-20  rounded-full bg-purple-200" />
                </div>
                <div className="gameEntry">
                    {/* Nickname and Play Section */}
                    <div className="flex items-center gap-0">
                        <div className="relative w-full">
                            <input ref={inputRef} type="text" className="w-full placeholder:font-medium placeholder:text-white m-0 outline-0 rounded-l-full outline-none text-white font-bold" placeholder="Nickname ..." />
                            <lord-icon
                                src="https://cdn.lordicon.com/hotfkuyz.json"
                                trigger="loop"
                                // state="loop-ar"
                                delay="2000"
                                style={{ width: "30px", height: "30px" }}
                                class="invert absolute top-4 right-4">
                            </lord-icon>
                        </div>
                        <span className="text-lg px-3 py-2 relative -left-3 rounded-r-full text-nowrap bg-pink-950 text-white font-extrabold cursor-pointer">Quick Play</span>
                    </div>
                    {/* All the different options */}
                    <div className="flex flex-col gap-3 w-full">
                        <div className="flex gap-2 w-full  justify-around">
                            <button className="text-2xl px-5 py-2  rounded-full text-nowrap bg-teal-500 text-white font-extrabold cursor-pointer">Find A Duel</button>
                            <button className="text-2xl px-5 py-2  rounded-full text-nowrap bg-emerald-500 text-white font-extrabold cursor-pointer ">Custom Maps</button>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            {/* Main Button */}
                            <button onClick={() => setSelectDropdown((prev) => !prev)} className="text-2xl px-8 py-3 rounded-full bg-orange-500 text-white font-extrabold flex flex-col items-center gap-3" >
                                <div className="flex items-center gap-2">
                                    {/* Icon */}
                                    <lord-icon
                                        src="https://cdn.lordicon.com/xcrjfuzb.json"
                                        trigger="loop"
                                        delay="1000"
                                        style={{ width: "30px", height: "30px" }}
                                        className="invert"
                                    ></lord-icon>
                                    {/* Button Label */}
                                    <span className="font-extrabold">Private Game</span>
                                </div>
                            </button>

                            {/* Dropdown Options */}
                            {selectDropdown && (
                                <div className="flex flex-col gap-0 w-fit relative bottom-1 -right-1 ">
                                    <div className="flex justify-center">
                                        <button className="border-x-2 border-y-2 p-2 pr-4 border-fuchsia-600  btnField  text-lg flex gap-2 items-center" >
                                            <lord-icon
                                                src="https://cdn.lordicon.com/nfgmqqvs.json"
                                                trigger="loop"
                                                delay="3000"
                                                style={{ width: "25px", height: "25px" }}
                                                class=""
                                            ></lord-icon>
                                            <span className="text-pink-700 font-extrabold">Join a Private Game</span>
                                        </button>
                                    </div>
                                    <div className="flex justify-center">
                                        <button className="border-x-2 border-y-2 p-2 pr-4 border-fuchsia-600  btnField  text-lg flex gap-2 items-center" >
                                            <lord-icon
                                                src="https://cdn.lordicon.com/bhprdjgb.json"

                                                trigger="loop"
                                                delay="3000"
                                                style={{ width: "25px", height: "25px" }}
                                                class=""
                                            ></lord-icon>
                                            <span className="text-pink-700 font-extrabold">Host a Private Game</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </>
    )
}