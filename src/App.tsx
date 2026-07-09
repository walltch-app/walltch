import { BrowserRouter, Route, Routes } from "react-router";
import Layout from "./app/Layout";
import AddonsPage from "./features/addons/AddonsPage";
import DetailPage from "./features/detail/DetailPage";
import DiscoverPage from "./features/discover/DiscoverPage";
import LibraryPage from "./features/library/LibraryPage";
import SettingsPage from "./features/settings/SettingsPage";

function App() {
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
			</Routes>
		</BrowserRouter>
	);
}

export default App;
