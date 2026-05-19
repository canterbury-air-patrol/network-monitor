import Sidebar from './Sidebar'
import MapArea from './MapArea'

export default function Layout() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <MapArea />
    </div>
  )
}
