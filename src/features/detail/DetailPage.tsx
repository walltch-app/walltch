import { useParams } from "react-router";

function DetailPage() {
	const { type, id } = useParams();

	return (
		<div className="page">
			<h1 className="page-title">Detail</h1>
			<p className="page-subtitle">
				{type} · {id}
			</p>
			<div className="empty">
				<h2>Details are on the way</h2>
				<p>Metadata, seasons and streams for this title land here next.</p>
			</div>
		</div>
	);
}

export default DetailPage;
