import { useTranslation } from '@/components/useTranslations';

export default function Banned() {
    const { t: text } = useTranslation('common');

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            color: 'white',
            fontFamily: '"Lexend", sans-serif',
            textAlign: 'center'
        }}>
            <h1 style={{ color: '#f44336', fontSize: 'clamp(28px, 6vw, 48px)', marginBottom: '20px' }}>
                ⛔ {text("accountSuspended") || "Account Suspended"}
            </h1>

            <p style={{ maxWidth: '600px', lineHeight: '1.6', marginBottom: '15px', color: '#b0b0b0' }}>
                {text("banExtensionWarning") || "Sometimes, third-party browser extensions can interfere with the game and trigger our anti-cheat system."}
            </p>
            <p style={{ maxWidth: '600px', lineHeight: '1.6', marginBottom: '30px', color: '#b0b0b0' }}>
                {text("banExtensionSuggestion") || "Please try disabling any extensions you have running and see if you are able to access the game."}
            </p>

            <div style={{
                background: 'rgba(88, 101, 242, 0.15)',
                border: '2px solid #5865F2',
                borderRadius: '16px',
                padding: '30px',
                maxWidth: '550px',
                marginBottom: '30px'
            }}>
                <h2 style={{ color: '#5865F2', marginBottom: '20px', fontSize: 'clamp(20px, 4vw, 28px)' }}>
                    📋 {text("howToAppeal") || "How to Appeal"}
                </h2>
                <p style={{ color: '#e0e0e0', lineHeight: '1.8', marginBottom: '20px' }}>
                    {text("appealIntro") || "If you believe this ban was applied incorrectly, you can appeal through our official Discord server:"}
                </p>
                <ol style={{ textAlign: 'left', color: '#e0e0e0', lineHeight: '2', paddingLeft: '20px' }}>
                    <li>{text("appealStep1") || "Join our Discord server"}</li>
                    <li>{text("appealStep2") || "Verify your Discord account"}</li>
                    <li>{text("appealStep3") || "Go to the #appeal-game-ban channel"}</li>
                    <li>{text("appealStep4") || "Create a support ticket following the instructions"}</li>
                    <li>{text("appealStep5") || "A verified player will conduct a live appeal test"}</li>
                </ol>
                <a
                    href="https://discord.gg/ADw47GAyS5"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        display: 'inline-block',
                        marginTop: '20px',
                        padding: '15px 30px',
                        background: '#5865F2',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '10px',
                        fontWeight: 'bold',
                        fontSize: '16px',
                        transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseOver={(e) => {
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 4px 15px rgba(88, 101, 242, 0.4)';
                    }}
                    onMouseOut={(e) => {
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = 'none';
                    }}
                >
                    {text("joinDiscord") || "Join Discord Server"}
                </a>
            </div>

            <p style={{ color: '#666', fontSize: '14px' }}>
                ⚠️ {text("appealsNotEmail") || "Appeals are not handled over email."}
            </p>
        </div>
    )
}
