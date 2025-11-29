import sys
import os
from pymongo import MongoClient

def get_user_input():
    """Get username from command line args or user input"""
    if len(sys.argv) > 1:
        return sys.argv[1]

    username = input("Enter WorldGuessr username: ").strip()
    if not username:
        print("Username is required!")
        sys.exit(1)
    return username

def get_account_id_from_username(client, username):
    """Look up account ID from username in users collection"""
    user = client['test']['users'].find_one({'username': username})

    if not user:
        print(f"Username '{username}' not found in database!")
        print("Make sure you've entered the exact username.")
        sys.exit(1)

    # Convert ObjectId to string to match the format used in games collection
    return str(user['_id'])

# Get the username to analyze
username = get_user_input()

# Connect to MongoDB
mongodb_uri = os.getenv('MONGODB_URI')
if not mongodb_uri:
    print("Error: MONGODB_URI environment variable not set!")
    print("Set it with: export MONGODB_URI='mongodb://...'")
    sys.exit(1)

client = MongoClient(mongodb_uri)

# Get account ID from username
account_id = get_account_id_from_username(client, username)

print(f"Analyzing account: {username} ({account_id})")
print()

result = client['test']['games'].aggregate([
    {
        '$match': {
            'players.accountId': account_id,
            'gameType': 'ranked_duel'
        }
    }, {
        '$unwind': '$players'
    }, {
        '$match': {
            'players.accountId': {
                '$ne': account_id
            }
        }
    }, {
        '$group': {
            '_id': '$players.accountId',
            'opponentUsername': {
                '$first': '$players.username'
            },
            'gamesPlayed': {
                '$sum': 1
            },
            'wins': {
                '$sum': {
                    '$cond': {
                        'if': {
                            '$eq': [
                                '$result.winner', account_id
                            ]
                        },
                        'then': 1,
                        'else': 0
                    }
                }
            },
            'losses': {
                '$sum': {
                    '$cond': {
                        'if': {
                            '$ne': [
                                '$result.winner', account_id
                            ]
                        },
                        'then': 1,
                        'else': 0
                    }
                }
            }
        }
    }, {
        '$sort': {
            'gamesPlayed': -1
        }
    }
])

import json
from tabulate import tabulate

opponent_stats = list(result)

# Calculate win rate for each opponent
for stat in opponent_stats:
    stat['win_rate'] = round((stat['wins'] / stat['gamesPlayed']) * 100, 1) if stat['gamesPlayed'] > 0 else 0

# Sort by games played (descending) then by win rate (ascending for hardest opponents first)
opponent_stats.sort(key=lambda x: (-x['gamesPlayed'], x['win_rate']))

print("=== GEOGUESSR OPPONENT ANALYSIS ===")
print(f"Total opponents analyzed: {len(opponent_stats)}")
print()

# Create table data
table_data = []
for i, stat in enumerate(opponent_stats, 1):
    table_data.append([
        i,
        stat['opponentUsername'][:20],  # Truncate long usernames
        stat['gamesPlayed'],
        stat['wins'],
        stat['losses'],
        f"{stat['win_rate']}%"
    ])

# Display top 20 most played opponents
print("=== TOP 20 MOST PLAYED OPPONENTS ===")
headers = ["Rank", "Username", "Games", "Wins", "Losses", "Win Rate"]
print(tabulate(table_data[:20], headers=headers, tablefmt="grid"))

print()

# Show some interesting stats
total_games = sum(stat['gamesPlayed'] for stat in opponent_stats)
total_wins = sum(stat['wins'] for stat in opponent_stats)
overall_win_rate = round((total_wins / total_games) * 100, 1) if total_games > 0 else 0

print("=== OVERALL STATS ===")
print(f"Total Games Played: {total_games}")
print(f"Total Wins: {total_wins}")
print(f"Total Losses: {total_games - total_wins}")
print(f"Overall Win Rate: {overall_win_rate}%")

print()

# Find interesting opponents
print("=== NOTABLE OPPONENTS ===")

if not opponent_stats:
    print("No ranked duel games found for this account!")
else:
    # Most games against
    most_played = max(opponent_stats, key=lambda x: x['gamesPlayed'])
    print(f"Most played against: {most_played['opponentUsername']} ({most_played['gamesPlayed']} games, {most_played['win_rate']}% win rate)")

    # Toughest opponents (min 3 games)
    tough_opponents = [stat for stat in opponent_stats if stat['gamesPlayed'] >= 3]
    if tough_opponents:
        toughest = min(tough_opponents, key=lambda x: x['win_rate'])
        print(f"Toughest opponent (3+ games): {toughest['opponentUsername']} ({toughest['win_rate']}% win rate over {toughest['gamesPlayed']} games)")

    # Perfect records against (min 3 games)
    perfect_records = [stat for stat in opponent_stats if stat['gamesPlayed'] >= 3 and stat['win_rate'] == 100]
    if perfect_records:
        print(f"Perfect records against ({len(perfect_records)} opponents with 3+ games)")
        for opponent in perfect_records[:5]:  # Show top 5
            print(f"  - {opponent['opponentUsername']}: {opponent['gamesPlayed']}-0")

    # Nemesis (opponents you lose to most)
    losing_records = [stat for stat in opponent_stats if stat['win_rate'] < 50 and stat['gamesPlayed'] >= 3]
    if losing_records:
        nemesis = min(losing_records, key=lambda x: x['win_rate'])
        print(f"Your nemesis: {nemesis['opponentUsername']} ({nemesis['win_rate']}% win rate over {nemesis['gamesPlayed']} games)")

print()
print("=== SAVE DATA ===")

# Save detailed data to JSON
with open('opponent_stats_detailed.json', 'w') as f:
    json.dump(opponent_stats, f, indent=2)

print("Detailed stats saved to: opponent_stats_detailed.json")