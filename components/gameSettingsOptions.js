

import { useTranslation } from "./useTranslations";

export default function gameSettingsOptions({setGameOptions, gameOptions}){
    
    const { t: text } = useTranslation("common");
    return (
        <div style={{display: "flex", flexDirection: 'column', alignItems: 'center', marginBottom: '5px', marginTop: '5px'}}>
            <div>
                <label htmlFor="nm">{text('nm')}</label>
                <input type="checkbox" checked={gameOptions.nm}
                id="nm"
                onChange={(e) => {
                    setGameOptions({
                        ...gameOptions,
                        nm: e.target.checked
                    })
                }
                } />
            </div>
            <div>
                <label htmlFor="npz">{text('npz')}</label>
                <input  id="npz" type="checkbox" checked={gameOptions.npz} onChange={(e) => {
                    setGameOptions({
                        ...gameOptions,
                        npz: e.target.checked
                    })
                }
                } />
            </div>
            <div>
                <label htmlFor="showRoadName" >{text('showRoadName')}</label>
                <input  id="showRoadName" type="checkbox" checked={gameOptions.showRoadName} onChange={(e) => {
                    setGameOptions({
                        ...gameOptions,
                        showRoadName: e.target.checked
                    })
                }
                } />
            </div>
        </div>
    )
    
}
