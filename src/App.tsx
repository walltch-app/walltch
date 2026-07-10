import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import Layout from "./app/Layout";
import AddonsPage from "./features/addons/AddonsPage";
import DetailPage from "./features/detail/DetailPage";
import CatalogPage from "./features/discover/CatalogPage";
import DiscoverPage from "./features/discover/DiscoverPage";
import TypeBoardPage from "./features/discover/TypeBoardPage";
import DownloadsPage from "./features/downloads/DownloadsPage";
import ContinuePage from "./features/library/ContinuePage";
import LibraryPage from "./features/library/LibraryPage";
import PlayerPage from "./features/player/PlayerPage";
import ProfilePage from "./features/profile/ProfilePage";
import SettingsPage from "./features/settings/SettingsPage";
import { getSettings } from "./lib/api";
import { applyAccent } from "./lib/theme";

function App() {
	useEffect(() => {
		getSettings()
			.then((settings) => applyAccent(settings.accent))
			.catch(() => {});
	}, []);

	return (
		<BrowserRouter>
			<Routes>
				<Route element={<Layout />}>
					<Route index element={<DiscoverPage />} />
					<Route
						path="movies"
						element={<TypeBoardPage contentType="movie" title="Filmler" />}
					/>
					<Route
						path="series"
						element={<TypeBoardPage contentType="series" title="Diziler" />}
					/>
					<Route
						path="anime"
						element={<TypeBoardPage contentType="anime" title="Animeler" />}
					/>
					<Route path="continue" element={<ContinuePage />} />
					<Route path="downloads" element={<DownloadsPage />} />
					<Route path="profile" element={<ProfilePage />} />
					<Route path="catalog" element={<CatalogPage />} />
					<Route path="library" element={<LibraryPage />} />
					<Route path="addons" element={<AddonsPage />} />
					<Route path="detail/:type/:id" element={<DetailPage />} />
					<Route path="settings" element={<SettingsPage />} />
				</Route>
				{/* Full-bleed, no sidebar while watching. */}
				<Route path="player" element={<PlayerPage />} />
			</Routes>
		</BrowserRouter>
	);
}

export default App;
