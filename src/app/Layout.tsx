import { Bookmark, Compass, Puzzle, Settings } from "lucide-react";
import { NavLink, Outlet } from "react-router";

const linkClass = ({ isActive }: { isActive: boolean }) =>
	isActive ? "nav-link active" : "nav-link";

function Layout() {
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
