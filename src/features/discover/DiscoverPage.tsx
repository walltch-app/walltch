import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { listCatalogs } from "../../lib/api";
import type { CatalogDescriptor } from "../../lib/bindings/CatalogDescriptor";
import SearchResults from "../search/SearchResults";
import CatalogRow from "./CatalogRow";
import ContinueRow from "./ContinueRow";
import FeaturedBillboard from "./FeaturedBillboard";
import TrendingRail from "./TrendingRail";
import "./discover.css";

function DiscoverPage() {
	const [catalogs, setCatalogs] = useState<CatalogDescriptor[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [params] = useSearchParams();
	const query = params.get("q")?.trim() ?? "";

	useEffect(() => {
		listCatalogs()
			.then(setCatalogs)
			.catch((e) => setError(String(e)));
	}, []);

	const hasCatalogs = catalogs !== null && catalogs.length > 0;

	const hour = new Date().getHours();
	const greeting =
		hour < 6
			? "Up late?"
			: hour < 12
				? "Good morning"
				: hour < 18
					? "Good afternoon"
					: "Good evening";

	return (
		<div className="page">
			{!query && (
				<div className="home-top">
					<h1 className="home-greeting">{greeting}</h1>
				</div>
			)}

			{error && <p className="form-error">{error}</p>}

			{query ? (
				<SearchResults query={query} />
			) : (
				<div className="home-grid">
					<div className="home-main">
						{catalogs?.length === 0 && (
							<div className="empty">
								<h2>No catalogs yet</h2>
								<p>
									Install an addon that provides catalogs — Cinemeta, for
									example — and they will show up here.
								</p>
								<Link to="/addons" className="btn">
									Install an addon
								</Link>
							</div>
						)}

						{hasCatalogs && <FeaturedBillboard catalog={catalogs[0]} />}

						<ContinueRow />

						{catalogs?.map((catalog) => (
							<CatalogRow
								key={`${catalog.transportUrl}/${catalog.type}/${catalog.id}`}
								catalog={catalog}
							/>
						))}
					</div>
					<TrendingRail catalogs={catalogs} />
				</div>
			)}
		</div>
	);
}

export default DiscoverPage;
