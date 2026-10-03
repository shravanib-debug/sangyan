import { createClient } from "@/lib/supabase/server";
import { connectBroker, disconnectBroker } from "../../broker/actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 px-6 py-12 items-center justify-center text-center">
        <h1 className="text-2xl font-bold mb-4">Settings</h1>
        <p className="text-gray-500 mb-6">You must be signed in to access settings.</p>
        <a href="/login" className="p-4 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700">Sign In</a>
      </div>
    );
  }

  // Fetch broker connection
  const { data: brokerConnection } = await supabase
    .from("broker_connections")
    .select("status, provider")
    .eq("user_id", user.id)
    .single();

  const isConnected = brokerConnection?.status === "live";

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 px-6 py-12">
      <div className="max-w-md mx-auto w-full space-y-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="text-xl font-bold">Broker Connection</h2>
          
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="font-medium text-gray-700">
              {isConnected ? "Connected to Zerodha" : "Not connected"}
            </span>
          </div>

          <p className="text-sm text-gray-500">
            {isConnected 
              ? "Your trading activity is being monitored safely in the background. Thehrav only has read access."
              : "Connect your Zerodha account to enable automatic trading activity monitoring."}
          </p>

          <form className="pt-2">
            {isConnected ? (
              <button 
                formAction={disconnectBroker}
                className="w-full p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold hover:bg-red-100 transition-colors"
              >
                Disconnect
              </button>
            ) : (
              <button 
                formAction={connectBroker}
                className="w-full p-4 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition-colors"
              >
                Connect Zerodha
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
