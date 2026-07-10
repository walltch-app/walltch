import { User } from "lucide-react";
import { useEffect, useState } from "react";
import { listContinueWatching, listWatchlist } from "../../lib/api";
import "./profile.css";

/** A small landing for the future account system; real numbers today. */
function ProfilePage() {
	const [watching, setWatching] = useState(0);
	const [saved, setSaved] = useState(0);

	useEffect(() => {
		listContinueWatching()
			.then((list) => setWatching(list.length))
			.catch(() => {});
		listWatchlist()
			.then((list) => setSaved(list.length))
			.catch(() => {});
	}, []);

	return (
		<div className="page">
			<div className="profile-head">
				<div className="avatar avatar-big">
					<User aria-hidden />
				</div>
				<div>
					<h1 className="page-title">Profil</h1>
					<p className="page-subtitle">
						Hesaplar ve cihazlar arası senkron yakında geliyor.
					</p>
				</div>
			</div>

			<div className="profile-stats">
				<div className="stat-card">
					<span className="stat-value">{watching}</span>
					<span className="stat-label">devam eden</span>
				</div>
				<div className="stat-card">
					<span className="stat-value">{saved}</span>
					<span className="stat-label">listende</span>
				</div>
			</div>
		</div>
	);
}

export default ProfilePage;
