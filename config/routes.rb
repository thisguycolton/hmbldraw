Rails.application.routes.draw do
  root "home#index"

  # Specific room routes MUST come before /rooms/:id
  get "/rooms/join", to: "rooms#join_page", as: :join_room_page
  post "/rooms/:id/join", to: "rooms#join", as: :join_room

  get "/debug/drawing", to: "debug#drawing"

  resources :rooms, only: [:new, :create, :show]

  get "/games/:id", to: "games#show", as: :game
end
