import { Bookmark, Compass, Puzzle, Settings } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";

const linkClass = ({ isActive }: { isActive: boolean }) =>
	isActive ? "nav-link active" : "nav-link";

function Layout() {
	const navigate = useNavigate();

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
			<aside className="sidebar">
				<div className="brand">
					<img src="/logo.png" alt="" />
					<span>Walltch</span>
				</div>
				<nav aria-label="Main">
					<NavLink to="/" end className={linkClass}>
						<Compass aria-hidden />
						Discover
					</NavLink>
					<NavLink to="/library" className={linkClass}>
						<Bookmark aria-hidden />
						Library
					</NavLink>
					<NavLink to="/addons" className={linkClass}>
						<Puzzle aria-hidden />
						Addons
					</NavLink>
				</nav>
				<div className="spacer" />
				<nav aria-label="Secondary">
					<NavLink to="/settings" className={linkClass}>
						<Settings aria-hidden />
						Settings
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
