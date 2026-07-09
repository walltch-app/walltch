import { Link } from "react-router";

function DiscoverPage() {
	return (
		<div className="page">
			<h1 className="page-title">Discover</h1>
			<p className="page-subtitle">Browse the catalogs your addons provide.</p>
			<div className="empty">
				<h2>No catalogs yet</h2>
				<p>Install an addon and its catalogs will show up here.</p>
				<Link to="/addons" className="btn">
					Install an addon
				</Link>
			</div>
		</div>
	);
}

export default DiscoverPage;
