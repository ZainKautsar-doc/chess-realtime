/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import ChessGame from './components/ChessGame';

export default function App() {
  return (
    <div className="min-h-screen bg-[#050505] p-6 flex flex-col items-center font-['Helvetica_Neue',Arial,sans-serif]">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Grandmaster Web
        </h1>
      </header>
      
      <main className="w-full flex justify-center">
        <ChessGame />
      </main>
    </div>
  );
}

