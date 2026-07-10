import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { listCatalogs } from "../../lib/api";
import type { CatalogDescriptor } from "../../lib/bindings/CatalogDescriptor";
import SearchResults from "../search/SearchResults";
import CatalogRow from "./CatalogRow";
import FeaturedBillboard from "./FeaturedBillboard";
import "./discover.css";

function DiscoverPage() {
	const [catalogs, setCatalogs] = useState<CatalogDescriptor[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [input, setInput] = useState("");
	const [query, setQuery] = useState("");

	useEffect(() => {
		listCatalogs()
			.then(setCatalogs)
			.catch((e) => setError(String(e)));
	}, []);

	// Debounced: the board swaps to results only once typing settles.
	useEffect(() => {
		const handle = setTimeout(() => setQuery(input.trim()), 350);
		return () => clearTimeout(handle);
	}, [input]);

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
			<div className="home-top">
				<h1 className="home-greeting">{greeting}</h1>
				<div className="home-search">
					<Search aria-hidden />
					<input
						id="home-search"
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
			</div>

			{error && <p className="form-error">{error}</p>}

			{query ? (
				<SearchResults query={query} />
			) : (
				<>
					{catalogs?.length === 0 && (
						<div className="empty">
							<h2>No catalogs yet</h2>
							<p>
								Install an addon that provides catalogs — Cinemeta, for example
								— and they will show up here.
							</p>
							<Link to="/addons" className="btn">
								Install an addon
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
				</>
			)}
		</div>
	);
}

export default DiscoverPage;
