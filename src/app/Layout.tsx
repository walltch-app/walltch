import {
	Bookmark,
	Cat,
	ChevronLeft,
	ChevronRight,
	Clapperboard,
	Compass,
	Download,
	History,
	Puzzle,
	Search,
	Settings,
	Tv,
	User,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	NavLink,
	Outlet,
	useLocation,
	useNavigate,
	useSearchParams,
} from "react-router";
import FriendRail from "../components/FriendRail";
import WindowControls from "../components/WindowControls";
import { avatarUri } from "../lib/avatar";
import { avatarInitial, formatFriendCode, useProfile } from "../lib/profile";

const linkClass = ({ isActive }: { isActive: boolean }) =>
	isActive ? "nav-link active" : "nav-link";

/** Global search box: typing lands you on the home board as results. */
function TopbarSearch() {
	const navigate = useNavigate();
	const location = useLocation();
	const [params] = useSearchParams();
	const urlQuery = location.pathname === "/" ? (params.get("q") ?? "") : "";
	const [input, setInput] = useState(urlQuery);

	// Follow outside navigation (back button, cleared query).
	useEffect(() => {
		setInput(urlQuery);
	}, [urlQuery]);

	useEffect(() => {
		const handle = setTimeout(() => {
			const query = input.trim();
			if (query === urlQuery) return;
			navigate(query ? `/?q=${encodeURIComponent(query)}` : "/", {
				replace: location.pathname === "/",
			});
		}, 350);
		return () => clearTimeout(handle);
	}, [input, urlQuery, navigate, location.pathname]);

	return (
		<div className="home-search topbar-search">
			<Search aria-hidden />
			<input
				id="global-search"
				type="search"
				placeholder="Search movies and series…"
				value={input}
				onChange={(e) => setInput(e.currentTarget.value)}
				spellCheck={false}
				aria-label="Search"
			/>
			{input && (
				<button
					type="button"
					onClick={() => setInput("")}
					aria-label="Clear search"
				>
					<X aria-hidden />
				</button>
			)}
		</div>
	);
}

/** The avatar is the way into the account: it opens a small menu with the
 * pages that belong to you rather than to the catalogue. */
function UserMenu() {
	const { profile } = useProfile();
	const [open, setOpen] = useState(false);
	const menu = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (event: MouseEvent) => {
			if (!menu.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		window.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div className="user-menu" ref={menu}>
			<button
				type="button"
				className="avatar"
				title="Account"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((current) => !current)}
				style={profile ? { background: profile.avatarColor } : undefined}
			>
				{!profile ? (
					<User aria-hidden />
				) : profile.avatar ? (
					<img src={avatarUri(profile.avatar, profile.avatarColor)} alt="" />
				) : (
					<span>{avatarInitial(profile.displayName)}</span>
				)}
			</button>
			{open && (
				<div className="user-menu-panel">
					{profile && (
						<div className="user-menu-head">
							<strong>{profile.displayName}</strong>
							<span>{formatFriendCode(profile.friendCode)}</span>
						</div>
					)}
					<NavLink
						to="/profile"
						className="user-menu-item"
						onClick={() => setOpen(false)}
					>
						<User aria-hidden />
						Profile
					</NavLink>
					<NavLink
						to="/settings"
						className="user-menu-item"
						onClick={() => setOpen(false)}
					>
						<Settings aria-hidden />
						Settings
					</NavLink>
				</div>
			)}
		</div>
	);
}

function Layout() {
	const [collapsed, setCollapsed] = useState(
		() => localStorage.getItem("sidebar") === "collapsed",
	);

	const toggleSidebar = () => {
		setCollapsed((current) => {
			const next = !current;
			localStorage.setItem("sidebar", next ? "collapsed" : "open");
			return next;
		});
	};

	// "/" or Ctrl+K focuses the global search from anywhere (unless typing).
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const typing = (event.target as HTMLElement)?.tagName === "INPUT";
			const slash = event.key === "/" && !typing;
			const ctrlK = event.key === "k" && (event.ctrlKey || event.metaKey);
			if (slash || ctrlK) {
				event.preventDefault();
				document.getElementById("global-search")?.focus();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<div className="shell">
			{/* Frameless window: the topbar doubles as the titlebar. */}
			<header className="topbar" data-tauri-drag-region>
				<div className="brand">
					<img src="/logo.png" alt="" />
					<span>Walltch</span>
				</div>
				<TopbarSearch />
				<div className="topbar-spacer" data-tauri-drag-region />
				<UserMenu />
				<WindowControls />
			</header>
			<div className="shell-body">
				<aside className={collapsed ? "sidebar sidebar-min" : "sidebar"}>
					<button
						type="button"
						className="sidebar-toggle"
						onClick={toggleSidebar}
						aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					>
						{collapsed ? (
							<ChevronRight aria-hidden />
						) : (
							<ChevronLeft aria-hidden />
						)}
					</button>
					<nav aria-label="Main">
						<NavLink to="/" end className={linkClass} title="Discover">
							<Compass aria-hidden />
							<span className="nav-label">Discover</span>
						</NavLink>
						<NavLink to="/movies" className={linkClass} title="Movies">
							<Clapperboard aria-hidden />
							<span className="nav-label">Movies</span>
						</NavLink>
						<NavLink to="/series" className={linkClass} title="Series">
							<Tv aria-hidden />
							<span className="nav-label">Series</span>
						</NavLink>
						<NavLink to="/anime" className={linkClass} title="Anime">
							<Cat aria-hidden />
							<span className="nav-label">Anime</span>
						</NavLink>
						<NavLink to="/library" className={linkClass} title="My List">
							<Bookmark aria-hidden />
							<span className="nav-label">My List</span>
						</NavLink>
						<NavLink to="/continue" className={linkClass} title="Continue">
							<History aria-hidden />
							<span className="nav-label">Continue</span>
						</NavLink>
						<NavLink to="/downloads" className={linkClass} title="Downloads">
							<Download aria-hidden />
							<span className="nav-label">Downloads</span>
						</NavLink>
						<NavLink to="/addons" className={linkClass} title="Addons">
							<Puzzle aria-hidden />
							<span className="nav-label">Addons</span>
						</NavLink>
					</nav>
					<div className="spacer" />
					<div className="sidebar-glow nav-label" aria-hidden>
						<img src="/sidebar-glow.png" alt="" />
					</div>
				</aside>
				<main className="content">
					<Outlet />
				</main>
				<FriendRail />
			</div>
		</div>
	);
}

export default Layout;
