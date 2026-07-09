import { useEffect, useState } from "react";
import { Link } from "react-router";
import { listCatalogs } from "../../lib/api";
import type { CatalogDescriptor } from "../../lib/bindings/CatalogDescriptor";
import CatalogRow from "./CatalogRow";
import "./discover.css";

function DiscoverPage() {
	const [catalogs, setCatalogs] = useState<CatalogDescriptor[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		listCatalogs()
			.then(setCatalogs)
			.catch((e) => setError(String(e)));
	}, []);

	return (
		<div className="page">
			<h1 className="page-title">Discover</h1>
			<p className="page-subtitle">Browse the catalogs your addons provide.</p>

			{error && <p className="form-error">{error}</p>}

			{catalogs?.length === 0 && (
				<div className="empty">
					<h2>No catalogs yet</h2>
					<p>
						Install an addon that provides catalogs — Cinemeta, for example —
						and they will show up here.
					</p>
					<Link to="/addons" className="btn">
						Install an addon
					</Link>
				</div>
			)}

			{catalogs?.map((catalog) => (
				<CatalogRow
					key={`${catalog.transportUrl}/${catalog.type}/${catalog.id}`}
					catalog={catalog}
				/>
			))}
		</div>
	);
}

export default DiscoverPage;
