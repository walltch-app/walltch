import {
	Bookmark,
	ChevronLeft,
	ChevronRight,
	Compass,
	Puzzle,
	Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";

const linkClass = ({ isActive }: { isActive: boolean }) =>
	isActive ? "nav-link active" : "nav-link";

function Layout() {
	const navigate = useNavigate();
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

	// "/" or Ctrl+K focuses the home search from anywhere (unless typing).
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const typing = (event.target as HTMLElement)?.tagName === "INPUT";
			const slash = event.key === "/" && !typing;
			const ctrlK = event.key === "k" && (event.ctrlKey || event.metaKey);
			if (slash || ctrlK) {
				event.preventDefault();
				navigate("/");
				setTimeout(() => {
					document.getElementById("home-search")?.focus();
				}, 60);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [navigate]);

	return (
		<div className="shell">
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
				<div className="brand">
					<img src="/logo.png" alt="" />
					<span className="nav-label">Walltch</span>
				</div>
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
	);
}

export default Layout;
