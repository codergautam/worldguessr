"use client"
import React, {useState} from 'react'
import {Button} from "@/components/ui/button";

import {useRouter} from "next/router";
import Header from "@/components/structure/Header";

import Rounded from '@/components/ui/Buttons/Rounded';

const Home = () => {

    const router = useRouter()

    return (
        <div className="dark:bg-black bg-white size-full min-h-[100vh]">
            <Header floating={false} logo={true} themeSwitcher={false}/>

            <div
                className={"flex flex-col items-center justify-center text-[#222] dark:text-[#ccc] text-3xl font-bold"}>
                <span>
                    Welcome to
                </span>
                <span className={"text-8xl font-black"}>
                    <span className={"bg-gradient-to-r from-blue-600 to-green-500 text-transparent bg-clip-text"}>
                        World
                    </span>
                    <span>
                        Guessr
                    </span>
                </span>
            </div>

            <div className={"flex flex-row items-center justify-center mt-8"}>
                {/*<Button variant={"outline"}*/}
                {/*        className={"bg-[#ccc] dark:bg-[#333] rounded-2xl hover:bg-green-500 font-bold text-xl p-8"}*/}
                {/*        onClick={() => {*/}
                {/*            router.push("/game")*/}
                {/*        }}>*/}
                {/*    Play*/}
                {/*</Button>*/}
                <Rounded backgroundColor={"#27e55d"} onClick={() => {
                    router.push("/game")
                }}>
                    <p>Play</p>
                </Rounded>
            </div>

            <div className={"flex flex-row items-center justify-center mt-8"}>
                More features coming soon
            </div>

        </div>

    )
}
export default Home