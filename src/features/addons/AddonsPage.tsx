function AddonsPage() {
	return (
		<div className="page">
			<h1 className="page-title">Addons</h1>
			<p className="page-subtitle">
				Addons provide the catalogs, metadata and streams you see in Walltch.
			</p>
			<div className="empty">
				<h2>No addons installed</h2>
				<p>Paste an addon's manifest URL to install it. Coming right up.</p>
			</div>
		</div>
	);
}

export default AddonsPage;
