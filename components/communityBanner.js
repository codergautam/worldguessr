import { FaEarthAmericas } from "react-icons/fa6";

// "Join our community" — a single button rendered as the home footer's
// immediate sibling, pinned directly above it. Opens the forum through the
// same SSO bridge as the footer's forum button. Shares the footer's
// visibility cycle via the `visible`/`covered` props (covered = a modal is
// over the home screen: hide without replaying the entrance); the caller
// hides it in schoolguessr/embed contexts.
export default function CommunityBanner({ visible, covered, onVisitForum, text }) {
    return (
        <button className={`community_banner g2_hover_effect ${visible ? "visible" : ""} ${covered ? "covered" : ""}`} onClick={onVisitForum}>
            <FaEarthAmericas className="community_banner__icon" /> {text("communityBannerTitle")}
        </button>
    );
}
