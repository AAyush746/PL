import { useNavigate } from 'react-router-dom';
import MemberHeader from '../components/MemberHeader';
import LandingSections from '../components/LandingSections';

export default function MemberHome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f3ebdb] text-slate-800">
      <MemberHeader />
      <LandingSections onStartTrial={() => navigate('/start-trial')} />
    </div>
  );
}
