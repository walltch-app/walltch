import {
	Bookmark,
	ChevronLeft,
	ChevronRight,
	Compass,
	Puzzle,
	Search,
	Settings,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	NavLink,
	Outlet,
	useLocation,
	useNavigate,
	useSearchParams,
} from "react-router";

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
			<header className="topbar">
				<div className="brand">
					<img src="/logo.png" alt="" />
					<span>Walltch</span>
				</div>
				<TopbarSearch />
				<div className="topbar-spacer" />
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
						<NavLink to="/library" className={linkClass} title="Library">
							<Bookmark aria-hidden />
							<span className="nav-label">Library</span>
						</NavLink>
						<NavLink to="/addons" className={linkClass} title="Addons">
							<Puzzle aria-hidden />
							<span className="nav-label">Addons</span>
						</NavLink>
					</nav>
					<div className="spacer" />
					<blockquote className="sidebar-quote nav-label">
						“Cinema is a matter of what's in the frame and what's out.”
					</blockquote>
					<nav aria-label="Secondary">
						<NavLink to="/settings" className={linkClass} title="Settings">
							<Settings aria-hidden />
							<span className="nav-label">Settings</span>
						</NavLink>
					</nav>
				</aside>
				<main className="content">
					<Outlet />
				</main>
			</div>
		</div>
	);
}

export default Layout;
