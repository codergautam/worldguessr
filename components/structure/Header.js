import React, { useEffect, useState } from 'react'
import Image from "next/image";
import {useCurrentTheme} from "@/hooks/useCurrentTheme";
import {ThemeSwitcher} from "@/components/themes/theme-switcher";
import {cn} from "@/lib/utils";

const Header = ({floating=false, logo=false, themeSwitcher=false, logoBlur=false}) => {
    const theme = useCurrentTheme();

    return (
        <header className={cn("flex flex-row items-center p-4 px-8 z-50", floating ? "fixed" : "")}>
            {
                logoBlur && (
                    <>
                        <Image src={"/blur2.png"} alt={"blur"} width={"700"} height={"450"} className={"fixed top-[-250px] left-[-320px] z-0 select-none pointer-events-none"} />
                        <Image src={"/blur2.png"} alt={"blur"} width={"700"} height={"450"} className={"fixed top-[-200px] left-[-350px] z-0 select-none pointer-events-none"} />
                        <Image src={"/blur2.png"} alt={"blur"} width={"700"} height={"450"} className={"fixed top-[-200px] left-[-350px] z-0 select-none pointer-events-none"} />
                    </>
                )
            }

            {
                logo && theme && (
                    <a href={"/"} className={cn("", logoBlur?"fixed top-[15px] left-0 z-10":"")}>

                        {(theme === 'dark') ? (
                            <Image src={"/logo_dark_mode.png"} width={256} height={256} className={"m-2"} alt={"logo"}/>
                        ) : (
                            <Image src={"/logo_light_mode.png"} width={256} height={256} className={"m-2"} alt={"logo"}/>
                        )}
                    </a>
                )
            }
            {
                themeSwitcher && (
                    <ThemeSwitcher/>
                )
            }
        </header>
    )
}
export default Header