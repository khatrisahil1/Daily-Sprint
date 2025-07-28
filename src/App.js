import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import Papa from 'papaparse';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyCAtcBA3xBt4M5DLhCej4wCFjkOHyXftvc",
  authDomain: "sprint-os-tracker.firebaseapp.com",
  projectId: "sprint-os-tracker",
  storageBucket: "sprint-os-tracker.appspot.com",
  messagingSenderId: "547477521497",
  appId: "1:547477521497:web:48beaaab2784e1e1f1dd48",
  measurementId: "G-MNVY35TL52"
};

// --- Static Data Configuration ---
const SPRINT_ASSESSMENT_DATE = '2025-08-18';
const QUOTES = [
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "A year from now you may wish you had started today.", author: "Karen Lamb" },
    { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
];

const SPRINT_DATA = {
    weeks: [
        {
            title: 'Week 1: Building the Foundation',
            goal: 'Establish a rock-solid routine.',
            days: [ { day: 1, baseTasks: [{ type: 'Apti', desc: 'Percentages' }, { type: 'DSA', desc: 'C++ Tutorial & 1 Array-Easy Problem' }] } ]
        },
    ]
};

const App = () => {
    // --- State Management ---
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [sprintData, setSprintData] = useState({ tasks: [], resources: [], weeklyGoals: {}, startDate: new Date().toISOString() });
    const [activeView, setActiveView] = useState('dashboard');
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [countdown, setCountdown] = useState('');
    const [authError, setAuthError] = useState(null);
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    // --- Memoized Functions ---
    const getTasksForDay = useCallback((dayNumber) => {
        const base = SPRINT_DATA.weeks.flatMap(w => w.days).find(d => d.day === dayNumber)?.baseTasks || [];
        const userAdded = sprintData.tasks.filter(t => t.day === dayNumber && !t.id.startsWith('base_'));
        const baseWithCompletion = base.map((t, i) => {
            const id = `base_${dayNumber}_${i}`;
            const savedTask = sprintData.tasks.find(st => st.id === id);
            return { ...t, id, completed: savedTask?.completed || false };
        });
        return [...baseWithCompletion, ...userAdded];
    }, [sprintData.tasks]);

    const currentDayNumber = useMemo(() => {
        const now = new Date();
        const start = new Date(sprintData.startDate);
        start.setHours(0, 0, 0, 0);
        if (now < start) return 0;
        const diffTime = now - start;
        return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }, [sprintData.startDate]);
    
    const todayTasks = useMemo(() => getTasksForDay(currentDayNumber), [currentDayNumber, getTasksForDay]);
    
    // --- Effects ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const auth = getAuth(app);
            const firestore = getFirestore(app);
            setDb(firestore);

            onAuthStateChanged(auth, (user) => {
                if (user) {
                    setUserId(user.uid);
                    setAuthError(null);
                } else {
                    signInAnonymously(auth).catch(error => {
                        console.error("Anonymous sign-in failed:", error);
                        setAuthError("Could not connect to the database. Please ensure 'Anonymous' sign-in is enabled in your Firebase project.");
                    });
                }
            });
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            setAuthError("Firebase configuration is invalid.");
        }

        const savedTheme = localStorage.getItem('sprintTheme_v12');
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
            setIsDarkMode(true);
        }
    }, []);

    useEffect(() => {
        if (db && userId) {
            const docRef = doc(db, 'sprints', userId);
            const unsubscribe = onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists()) {
                    setSprintData(docSnap.data());
                } else {
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const initialData = { 
                        tasks: [], 
                        resources: [{title: "Aptitude Playlist", url: "https://www.youtube.com/playlist?list=PLgH1hI-Bibo8o5-qzzG-Qp3Y-52s-aJ2F", desc: "For Quantitative Aptitude"}], 
                        weeklyGoals: {},
                        startDate: today.toISOString()
                    };
                    setDoc(docRef, initialData);
                    setSprintData(initialData);
                }
            });
            return () => unsubscribe();
        }
    }, [db, userId]);

    useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date().getTime();
            const assessmentDate = new Date(SPRINT_ASSESSMENT_DATE).getTime();
            const distance = assessmentDate - now;
            if (distance < 0) {
                setCountdown("Assessments have begun!");
            } else {
                const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                setCountdown(`${days}d ${hours}h ${minutes}m ${seconds}s`);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // --- Data Update Functions ---
    const updateTasks = async (newTasks) => {
        if (!db || !userId) return;
        const docRef = doc(db, 'sprints', userId);
        await updateDoc(docRef, { tasks: newTasks });
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            Papa.parse(file, {
                header: true,
                complete: (results) => {
                    const newTasks = results.data.map(row => ({
                        id: `csv_${Date.now()}_${Math.random()}`,
                        day: parseInt(row.day, 10),
                        desc: row.description,
                        type: row.type,
                        completed: false,
                    })).filter(task => !isNaN(task.day) && task.desc && task.type);
                    updateTasks([...sprintData.tasks, ...newTasks]);
                }
            });
        }
    };

    // --- UI Components ---
    const StatCard = ({ title, value }) => (
        <div className="card p-4 rounded-lg shadow-md text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-3xl font-bold text-teal-500">{value}</p>
        </div>
    );
    
    const TodayMission = () => (
        <section className="card p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4 border-b pb-2 border-gray-200 dark:border-slate-700">
                <h2 className="text-2xl font-bold">Today's Mission</h2>
            </div>
            {todayTasks.length > 0 ? (
                <ul className="space-y-3">
                    {todayTasks.map(task => (
                        <li key={task.id} className="flex items-center">
                            <input type="checkbox" id={task.id} checked={task.completed} onChange={(e) => updateTasks(sprintData.tasks.map(t => t.id === task.id ? {...t, completed: e.target.checked} : t))}
                                className="h-5 w-5 rounded border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-teal-600 focus:ring-teal-500" />
                            <label htmlFor={task.id} className={`ml-3 flex-1 ${task.completed ? 'line-through text-gray-400' : ''}`}>{task.desc}</label>
                        </li>
                    ))}
                </ul>
            ) : <p className="text-gray-500 dark:text-gray-400">No tasks for today.</p>}
        </section>
    );

    // --- Main Render ---
    if (authError) {
        return <div className="h-screen flex items-center justify-center bg-gray-100 p-4"><div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg shadow-lg max-w-lg"><p className="font-bold text-lg">Authentication Error</p><p>{authError}</p></div></div>;
    }

    return (
        <div className={`flex h-screen font-sans ${isDarkMode ? 'dark' : ''}`}>
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm shadow-md z-20 fixed top-0 w-full">
                    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between h-16">
                             <div className="flex-shrink-0 font-bold text-teal-500 text-xl">Sprint OS</div>
                            <nav className="hidden md:flex items-center space-x-1">
                                {['dashboard', 'full-plan', 'progress'].map(view => (
                                    <button key={view} onClick={() => setActiveView(view)}
                                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeView === view ? 'bg-teal-100 dark:bg-teal-900 text-teal-600 dark:text-teal-300' : 'text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                                        {view.charAt(0).toUpperCase() + view.slice(1).replace('-', ' ')}
                                    </button>
                                ))}
                            </nav>
                            <div className="flex items-center space-x-4">
                               <button onClick={() => { setIsDarkMode(!isDarkMode); document.documentElement.classList.toggle('dark'); localStorage.setItem('sprintTheme_v12', !isDarkMode ? 'dark' : 'light'); }} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700">
                                   {isDarkMode ? '☀️' : '🌙'}
                               </button>
                               <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700">☰</button>
                            </div>
                        </div>
                    </div>
                </header>
                
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 dark:bg-slate-900 pt-16">
                    <div className="container mx-auto p-4 md:p-8">
                        {activeView === 'dashboard' && (
                            <div className="space-y-8">
                                <div className="text-center p-4 bg-teal-500 text-white rounded-lg shadow-md"><p className="font-semibold">Assessment Countdown: {countdown}</p></div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <StatCard title="Sprint Day" value={currentDayNumber} />
                                    <StatCard title="Today's Progress" value={`${todayTasks.filter(t => t.completed).length}/${todayTasks.length}`} />
                                    <StatCard title="Current Streak" value={`${useMemo(() => {
                                        let streak = 0;
                                        for (let i = currentDayNumber - 1; i >= 1; i--) {
                                            const allTasksForDay = getTasksForDay(i);
                                            if (allTasksForDay.length > 0 && allTasksForDay.every(task => task.completed)) {
                                                streak++;
                                            } else {
                                                break;
                                            }
                                        }
                                        return streak;
                                    }, [sprintData.tasks, currentDayNumber, getTasksForDay])} Days`} />
                                    <StatCard title="Total Completed" value={sprintData.tasks.filter(t => t.completed).length} />
                                </div>
                                <TodayMission />
                                <section className="card p-6 shadow-lg">
                                    <h2 className="text-2xl font-bold mb-4">Import Tasks</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Upload a CSV with columns: day, description, type</p>
                                    <input type="file" accept=".csv" onChange={handleFileUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"/>
                                </section>
                            </div>
                        )}
                        {/* Other views will be added here */}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default App;
