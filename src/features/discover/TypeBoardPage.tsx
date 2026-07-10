import { useEffect, useState } from "react";
import { Link } from "react-router";
import { listCatalogs } from "../../lib/api";
import type { CatalogDescriptor } from "../../lib/bindings/CatalogDescriptor";
import CatalogRow from "./CatalogRow";
import FeaturedBillboard from "./FeaturedBillboard";
import "./discover.css";

/** The home board scoped to one content type (Movies / Series). */
function TypeBoardPage({
	contentType,
	title,
}: {
	contentType: string;
	title: string;
}) {
	const [catalogs, setCatalogs] = useState<CatalogDescriptor[] | null>(null);

	useEffect(() => {
		setCatalogs(null);
		listCatalogs()
			.then((all) => setCatalogs(all.filter((c) => c.type === contentType)))
			.catch(() => setCatalogs([]));
	}, [contentType]);

	const hasCatalogs = catalogs !== null && catalogs.length > 0;

	return (
		<div className="page">
			<div className="home-top">
				<h1 className="home-greeting">{title}</h1>
			</div>

			{catalogs?.length === 0 && (
				<div className="empty">
					<h2>No {title.toLowerCase()} catalogs</h2>
					<p>None of your addons provide catalogs for this type yet.</p>
					<Link to="/addons" className="btn">
						Browse addons
					</Link>
				</div>
			)}

			{hasCatalogs && <FeaturedBillboard catalog={catalogs[0]} />}

			{catalogs?.map((catalog) => (
				<CatalogRow
					key={`${catalog.transportUrl}/${catalog.type}/${catalog.id}`}
					catalog={catalog}
				/>
			))}
		</div>
	);
}

export default TypeBoardPage;
