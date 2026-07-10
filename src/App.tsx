import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import Layout from "./app/Layout";
import AddonsPage from "./features/addons/AddonsPage";
import DetailPage from "./features/detail/DetailPage";
import DiscoverPage from "./features/discover/DiscoverPage";
import LibraryPage from "./features/library/LibraryPage";
import PlayerPage from "./features/player/PlayerPage";
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
